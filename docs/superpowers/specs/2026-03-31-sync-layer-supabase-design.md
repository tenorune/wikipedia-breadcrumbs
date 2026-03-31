# Sync Layer + Supabase — Design Spec

**Date:** 2026-03-31
**Status:** Draft
**Parent spec:** `2026-03-30-wikipedia-breadcrumbs-design.md`
**Scope:** Supabase backend setup, Postgres schema with RLS, bidirectional sync engine in shared library, anonymous auth, extension integration.

---

## Overview

Phase 2 adds remote persistence via Supabase. The sync layer lives in `packages/shared/sync/` so both the Chrome extension and (future) PWA can use it. Data flows offline-first: all writes go to local IndexedDB, then sync pushes changes to Supabase and pulls remote changes back. Anonymous Supabase auth provides user isolation without requiring sign-up.

A separate setup guide (gitignored) walks through Supabase project creation.

**Dependencies:** `@wikipedia-breadcrumbs/shared` (models, db), `@supabase/supabase-js`

---

## Supabase Schema

### Tables

All tables use UUID primary keys (generated client-side). Timestamps are ISO 8601 strings stored as `timestamptz`.

#### `trails`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK, client-generated |
| `user_id` | uuid | FK to `auth.users`, set on first sync |
| `name` | text | Nullable |
| `created_at` | timestamptz | |
| `started_at` | timestamptz | |
| `ended_at` | timestamptz | Nullable |
| `status` | text | `active` or `finalized` |
| `is_starred` | boolean | |
| `tags` | text[] | |
| `note` | text | Nullable |
| `visibility` | text | `private`, `unlisted`, `public` |
| `device_id` | text | |
| `forked_from_visit_id` | uuid | Nullable |
| `start_reason` | text | |
| `sync_status` | text | Client-only, not stored in Supabase |
| `updated_at` | timestamptz | |
| `deleted_at` | timestamptz | Nullable, soft delete |

Note: `sync_status` is a local-only field for both trails and visits. It is not included in the Supabase table — it exists only in IndexedDB to track which records need pushing.

#### `visits`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK, client-generated |
| `trail_id` | uuid | FK to `trails.id` |
| `user_id` | uuid | FK to `auth.users`, denormalized from trail for simpler RLS |
| `url` | text | |
| `title` | text | |
| `timestamp` | timestamptz | Discovery time |
| `last_visited_at` | timestamptz | Most recent visit |
| `position` | integer | |
| `source_type` | text | |
| `source_detail` | text | Nullable |
| `tab_id` | integer | Nullable |
| `window_id` | integer | Nullable |
| `note` | text | Nullable |
| `summary` | text | Nullable |
| `thumbnail_url` | text | Nullable |
| `language` | text | |
| `article_id` | text | |
| `updated_at` | timestamptz | |
| `deleted_at` | timestamptz | Nullable, soft delete |

#### `conflict_logs`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `user_id` | uuid | FK to `auth.users` |
| `record_type` | text | `visit` or `trail` |
| `record_id` | uuid | |
| `losing_snapshot` | jsonb | |
| `winning_snapshot` | jsonb | |
| `resolved_at` | timestamptz | Nullable |
| `created_at` | timestamptz | |

### Row-Level Security

All tables have RLS enabled. Policies:

```sql
-- trails
CREATE POLICY "Users manage own trails"
  ON trails FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- visits (denormalized user_id for direct RLS)
CREATE POLICY "Users manage own visits"
  ON visits FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- conflict_logs
CREATE POLICY "Users see own conflicts"
  ON conflict_logs FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

### Soft Delete Cleanup

A pg_cron scheduled job runs daily to hard-delete records where `deleted_at` is older than 30 days:

```sql
SELECT cron.schedule('cleanup-soft-deletes', '0 3 * * *', $$
  DELETE FROM visits WHERE deleted_at < now() - interval '30 days';
  DELETE FROM trails WHERE deleted_at < now() - interval '30 days';
  DELETE FROM conflict_logs WHERE resolved_at < now() - interval '30 days';
$$);
```

### Local Model Changes Required

- **`ConflictLog`** interface: add `userId: string` field (needed for Supabase push)
- **`Visit`** interface: no change needed — `user_id` is denormalized on push from the trail's `userId`

### Field Name Mapping

Local IndexedDB uses camelCase (`trailId`, `lastVisitedAt`). Postgres uses snake_case (`trail_id`, `last_visited_at`). The Supabase implementation of `SyncBackend` handles mapping in both directions. The `sync_status` field is stripped on push (it's local-only). The `user_id` on visits is injected from the trail's `userId` during push.

---

## Sync Engine (`packages/shared/sync/`)

### Architecture

```text
packages/shared/
├── sync/
│   ├── engine.ts          # Push/pull orchestration, conflict detection
│   ├── backend.ts         # SyncBackend interface
│   ├── supabase-backend.ts # Supabase implementation of SyncBackend
│   ├── field-mapper.ts    # camelCase <-> snake_case conversion
│   ├── conflict.ts        # Conflict logging
│   └── index.ts           # Public exports
```

### SyncBackend Interface

```typescript
interface SyncResult {
  id: string;
  success: boolean;
  error?: string;
}

interface SyncBackend {
  pushTrails(trails: Trail[]): Promise<SyncResult[]>;
  pushVisits(visits: Visit[]): Promise<SyncResult[]>;
  pushConflictLogs(logs: ConflictLog[]): Promise<SyncResult[]>;
  pullTrails(since: string): Promise<Trail[]>;
  pullVisits(since: string): Promise<Visit[]>;
}
```

The Supabase implementation maps fields to snake_case, calls `supabase.from('trails').upsert(...)` for push, and `supabase.from('trails').select().gt('updated_at', since)` for pull.

### Sync Engine

```typescript
interface SyncEngine {
  syncNow(): Promise<SyncReport>;
  getLastSyncTime(): Promise<string | null>;
}

interface SyncReport {
  pushed: { trails: number; visits: number };
  pulled: { trails: number; visits: number };
  conflicts: number;
  errors: string[];
}
```

**Concurrency guard:** The engine uses a boolean lock. If a sync is already in progress (e.g. auto-sync during a manual "sync now"), the second call returns immediately.

**Push flow:**
1. Verify Supabase session is active (re-authenticate if expired)
2. Query local trails where `sync_status` is `local_only` or `pending_sync` → `backend.pushTrails()` (batched, up to 50 per request)
3. On success per record, update local `sync_status` to `synced`
4. Query local visits where `sync_status` is `local_only` or `pending_sync` → `backend.pushVisits()` (batched)
5. Same status update on success
6. Push any local `conflict_logs` that haven't been pushed → `backend.pushConflictLogs()`

**Pull flow:**
1. Verify Supabase session is active
2. `backend.pullTrails(lastSyncTime)` → for each remote trail:
   - If no local copy: insert with `sync_status: synced`
   - If local copy exists and local is `synced` (no unpushed edits): overwrite local
   - If local copy has `sync_status: pending_sync` (unpushed local edits) and remote `updated_at` > local `updated_at`: this is a true conflict — overwrite local with remote, log the losing local snapshot to `conflict_logs`
   - If local is newer: skip (push will handle)
3. Same for visits
4. Update `lastSyncTime` to current timestamp

**Client-side cleanup (runs after pull):**
Soft-deleted local records older than 30 days are hard-deleted from IndexedDB to prevent unbounded growth.

**Conflict logging:**
When a remote record overwrites a local record that has unpushed changes, the losing local snapshot is saved to the `conflict_logs` table in IndexedDB. Conflict logs are push-only to Supabase (they originate locally and are never pulled back — they're device-specific).

### Sync State Storage

- `lastSyncTime` — stored in `chrome.storage.local` (extension) or `localStorage` (PWA)
- Accessed via an injectable `SyncStateStore` interface so the engine doesn't depend on a specific storage API

```typescript
interface SyncStateStore {
  getLastSyncTime(): Promise<string | null>;
  setLastSyncTime(time: string): Promise<void>;
}
```

---

## Anonymous Auth

### Flow

1. User enables sync (toggle in extension options or PWA settings)
2. App calls `supabase.auth.signInAnonymously()`
3. Supabase returns a session with a `user.id` (UUID)
4. All local trails with `user_id: null` are stamped with this UUID and marked `pending_sync`
5. Session is persisted — Supabase JS handles token refresh

### Session Persistence

- **Extension:** Supabase JS default persistence won't work in service worker context. The Supabase client is initialized in the offscreen document, where `localStorage` is available. Session persists there. If Chrome reclaims and recreates the offscreen document, the session is automatically restored from `localStorage` by `persistSession: true`.
- **PWA:** Standard Supabase JS `localStorage` persistence.

### No Sign-Up UI

Phase 2 has no sign-in/sign-up form. The anonymous auth happens automatically when sync is enabled. The user doesn't see an auth flow.

---

## Supabase Client

```typescript
// packages/shared/sync/supabase-client.ts
import { createClient, SupabaseClient } from "@supabase/supabase-js";

export function createSupabaseClient(
  url: string,
  anonKey: string
): SupabaseClient {
  return createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}
```

### Environment Variables

- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — Supabase anonymous/public key

These are safe to embed in client bundles — RLS protects the data. The anon key only grants access that RLS policies allow.

Stored in `.env` (gitignored). A `.env.example` is committed with placeholder values.

---

## Extension Integration

### Changes to Existing Code

**Options page (`packages/extension/src/options/`):**
- New toggle: "Sync enabled" (stored in `chrome.storage.local` as `syncEnabled`, default `false`)
- "Sync now" button (visible when sync is enabled)
- Last sync time display
- Sync status indicator (idle / syncing / error)

**Settings module (`packages/extension/src/shared/settings.ts`):**
- Add `syncEnabled: boolean` to `ExtensionSettings` (default `false`)

**Offscreen document (`packages/extension/src/offscreen/`):**
- New message types:
  - `{ type: "enableSync" }` — triggers anonymous auth + initial sync
  - `{ type: "disableSync" }` — stops sync timer
  - `{ type: "syncNow" }` — triggers immediate sync
  - `{ type: "getSyncStatus" }` — returns last sync time + sync state
- Sync runs in offscreen because it needs both IndexedDB and network access

**Background service worker:**
- `chrome.alarms` with 5-minute interval (`sync-interval`) when sync is enabled
- On alarm fire, sends `syncNow` to offscreen
- On `navigator.onLine` event (via offscreen), triggers sync

**Messaging types (`packages/extension/src/shared/messaging.ts`):**
- Add sync-related `OffscreenRequest` variants

### User ID Stamping

On first sync enable:
1. Anonymous auth → get `user_id`
2. Query all local trails where `user_id IS NULL`
3. Update each with the new `user_id` and mark `pending_sync`
4. Run initial sync (push all local data to Supabase)

---

## Error Handling

- **Network failure mid-sync:** Operations are idempotent (upserts keyed by UUID). Failed sync retries next cycle.
- **Partial batch failure:** Each record upserted independently. Failed records stay `pending_sync`, successful ones marked `synced`.
- **Supabase rate limits:** Exponential backoff: 1s, 2s, 4s, up to max 60s on 429 responses.
- **Auth token expiry:** Supabase JS auto-refreshes. If refresh fails, next sync attempt will re-authenticate.
- **Offline:** Sync skipped when `navigator.onLine` is false. Resumes automatically on connectivity.

---

## What's Deferred

| Feature | Phase |
|---------|-------|
| PWA with sync | Separate spec (Phase 2b) |
| Shared/public trail viewer | Backlog |
| Conflict review UI | Phase 3 |
| Google/Wikimedia OAuth | Phase 3 |
| Anonymous → authenticated upgrade | Phase 3 |
