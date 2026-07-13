# Sync Write Path & Error Surfacing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Batch the sync write path (Supabase upserts, local mark-Synced, user re-stamping), guard the PWA's `syncNow()`, and surface sync failures in the UI.

**Architecture:** `SupabaseBackend.upsertAll()` sends chunked array upserts instead of per-record calls; `SyncEngine.push()` marks Synced with one bulk Dexie `modify` per table; a new shared `restampForUser()` replaces three hand-rolled re-stamp loops; the PWA sync store gains an in-flight guard and a `syncError` state rendered in `SyncStatus.svelte` and the settings page.

**Tech Stack:** TypeScript, Dexie 4, Supabase JS v2, Svelte 5 runes, Vitest (+ fake-indexeddb in shared tests).

**Spec:** `docs/superpowers/specs/2026-07-13-sync-write-path-design.md`

## Global Constraints

- **Toolchain first:** installs fail until the pnpm 10→11 lockfile drift is reconciled (see `docs/ROADMAP.md` chores). Reconcile before starting; commit the regenerated lockfile separately from feature work.
- Shared tests: `pnpm --filter @wikipedia-breadcrumbs/shared test`. Pre-existing failure in `tests/db/visits.test.ts` ("update … sets updatedAt", same-ms timestamp) is NOT yours; the `engine.test.ts` lastSyncTime failure IS fixed by Task 3.
- Work on a feature branch off `main`. Commit messages end with the `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` trailer.
- `SyncResult[]` keeps one entry per record (id, success, error?) — callers depend on it.
- Never re-stamp `updatedAt` when only changing `syncStatus`/`userId` (spec §2/§3): use raw Dexie `modify`, not `trailStore.update()`/`visitStore.update()`.

---

### Task 1: Batch Supabase upserts in `SupabaseBackend`

**Files:**
- Modify: `packages/shared/src/sync/supabase-backend.ts:35-46`
- Test: `packages/shared/tests/sync/supabase-backend.test.ts`

**Interfaces:**
- Produces: `upsertAll` behavior — one `client.from(table).upsert(chunk)` call per ≤500-record chunk; returns `SyncResult[]` with one entry per input record. Public method signatures unchanged.

- [ ] **Step 1: Update the two existing push tests for array upserts**

In `packages/shared/tests/sync/supabase-backend.test.ts`, the mock's `upsertFn.mock.calls[0][0]` is now an **array**. Update:

```typescript
  it("pushTrails upserts trails with snake_case fields in one batch", async () => {
    const trail = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    trail.userId = "user-123";
    const results = await backend.pushTrails([trail]);
    expect(mock.from).toHaveBeenCalledWith("trails");
    expect(mock.upsertFn).toHaveBeenCalledTimes(1);
    const upsertArg = mock.upsertFn.mock.calls[0][0];
    expect(Array.isArray(upsertArg)).toBe(true);
    expect(upsertArg[0]).toHaveProperty("start_reason", "auto_new_tab");
    expect(upsertArg[0]).not.toHaveProperty("syncStatus");
    expect(upsertArg[0]).not.toHaveProperty("sync_status");
    expect(results[0].success).toBe(true);
  });
```

Same change in `"pushVisits upserts visits with snake_case and injects user_id"`: read `upsertArg[0]` instead of `upsertArg` (assertions on `user_id` and `trail_id` unchanged).

- [ ] **Step 2: Add chunking and failed-chunk tests**

Append to the same describe block:

```typescript
  it("chunks large batches at 500 records per upsert call", async () => {
    const trails = Array.from({ length: 1001 }, () =>
      createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" }));
    const results = await backend.pushTrails(trails);
    expect(mock.upsertFn).toHaveBeenCalledTimes(3); // 500 + 500 + 1
    expect(mock.upsertFn.mock.calls[0][0]).toHaveLength(500);
    expect(mock.upsertFn.mock.calls[2][0]).toHaveLength(1);
    expect(results).toHaveLength(1001);
    expect(results.every((r) => r.success)).toBe(true);
  });

  it("marks every record of a failed chunk as failed", async () => {
    mock.upsertFn.mockResolvedValue({ data: null, error: { message: "RLS violation" } });
    const trails = [
      createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" }),
      createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" }),
    ];
    const results = await backend.pushTrails(trails);
    expect(results).toHaveLength(2);
    expect(results.every((r) => !r.success && r.error === "RLS violation")).toBe(true);
    expect(results.map((r) => r.id)).toEqual(trails.map((t) => t.id));
  });
```

- [ ] **Step 3: Run tests to verify the new/updated ones fail**

Run: `pnpm --filter @wikipedia-breadcrumbs/shared test -- tests/sync/supabase-backend.test.ts`
Expected: FAIL — batch tests see 1001 upsert calls, `Array.isArray(upsertArg)` false.

- [ ] **Step 4: Implement chunked batch upsert**

Replace `upsertAll` in `packages/shared/src/sync/supabase-backend.ts`:

```typescript
const UPSERT_CHUNK_SIZE = 500;

  private async upsertAll(table: string, records: Record<string, unknown>[]): Promise<SyncResult[]> {
    const results: SyncResult[] = [];
    for (let i = 0; i < records.length; i += UPSERT_CHUNK_SIZE) {
      const chunk = records.slice(i, i + UPSERT_CHUNK_SIZE);
      const { error } = await this.client.from(table).upsert(chunk);
      for (const record of chunk) {
        results.push(error
          ? { id: record.id as string, success: false, error: error.message }
          : { id: record.id as string, success: true });
      }
    }
    return results;
  }
```

(`const UPSERT_CHUNK_SIZE = 500;` goes at module scope, below the imports.)

- [ ] **Step 5: Run the file's tests — all pass**

Run: `pnpm --filter @wikipedia-breadcrumbs/shared test -- tests/sync/supabase-backend.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/sync/supabase-backend.ts packages/shared/tests/sync/supabase-backend.test.ts
git commit -m "feat(sync): batch Supabase upserts in 500-record chunks"
```

---

### Task 2: Bulk mark-Synced in `SyncEngine.push()`

**Files:**
- Modify: `packages/shared/src/sync/engine.ts:59-96`
- Test: `packages/shared/tests/sync/engine.test.ts`

**Interfaces:**
- Consumes: `SyncResult[]` from backend push methods (Task 1 semantics).
- Produces: successful pushes are marked `SyncStatus.Synced` via `db.trails.where("id").anyOf(ids).modify(...)` — **`updatedAt` is left untouched** (behavior change per spec §2). Report counting unchanged.

- [ ] **Step 1: Add failing test — mark-Synced must not bump `updatedAt`**

Append to `packages/shared/tests/sync/engine.test.ts`:

```typescript
  it("does not re-stamp updatedAt when marking records Synced after push", async () => {
    const trail = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    trail.syncStatus = SyncStatus.PendingSync;
    trail.userId = "user-123";
    trail.updatedAt = "2026-01-01T00:00:00Z";
    await db.trails.add(trail);
    (backend.pushTrails as any).mockResolvedValue([{ id: trail.id, success: true }]);
    await engine.syncNow();
    const updated = await db.trails.get(trail.id);
    expect(updated?.syncStatus).toBe(SyncStatus.Synced);
    expect(updated?.updatedAt).toBe("2026-01-01T00:00:00Z");
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @wikipedia-breadcrumbs/shared test -- tests/sync/engine.test.ts`
Expected: FAIL — `updatedAt` was re-stamped by `trailStore.update()`.

- [ ] **Step 3: Replace the per-record loops with bulk modify**

In `packages/shared/src/sync/engine.ts`, replace the body of `push()` (lines 59-96). The `trails`/`visits` store consts disappear from `push()` (they remain in `pull()`/`mergeRecord()`):

```typescript
  private async push(report: SyncReport): Promise<void> {
    const pendingTrails = await this.db.trails
      .where("syncStatus").anyOf([SyncStatus.PendingSync, SyncStatus.LocalOnly]).toArray();
    if (pendingTrails.length > 0) {
      const results = await this.backend.pushTrails(pendingTrails);
      report.pushed.trails += await this.markSynced(this.db.trails, results, "Trail", report);
    }

    const pendingVisits = await this.db.visits
      .where("syncStatus").anyOf([SyncStatus.PendingSync, SyncStatus.LocalOnly]).toArray();
    if (pendingVisits.length > 0) {
      const results = await this.backend.pushVisits(pendingVisits);
      report.pushed.visits += await this.markSynced(this.db.visits, results, "Visit", report);
    }

    const pendingConflicts = await this.db.conflictLogs.filter((c) => !c.resolvedAt).toArray();
    if (pendingConflicts.length > 0) {
      const results = await this.backend.pushConflictLogs(pendingConflicts);
      report.pushed.conflictLogs = results.filter((r) => r.success).length;
    }
  }

  private async markSynced(
    table: { where(index: string): { anyOf(keys: string[]): { modify(changes: object): Promise<number> } } },
    results: SyncResult[],
    label: "Trail" | "Visit",
    report: SyncReport
  ): Promise<number> {
    const okIds = results.filter((r) => r.success).map((r) => r.id);
    if (okIds.length > 0) {
      await table.where("id").anyOf(okIds).modify({ syncStatus: SyncStatus.Synced });
    }
    for (const r of results) {
      if (!r.success) report.errors.push(`${label} push failed ${r.id}: ${r.error}`);
    }
    return okIds.length;
  }
```

Add `SyncResult` to the type import from `./types.js`:

```typescript
import type { SyncReport, SyncResult, SyncStateStore } from "./types.js";
```

- [ ] **Step 4: Run engine tests**

Run: `pnpm --filter @wikipedia-breadcrumbs/shared test -- tests/sync/engine.test.ts`
Expected: new test PASSES; all previous push/pull/conflict tests still pass ("updates lastSyncTime" still fails — fixed in Task 3).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/sync/engine.ts packages/shared/tests/sync/engine.test.ts
git commit -m "feat(sync): bulk mark-Synced without re-stamping updatedAt"
```

---

### Task 3: Fix the `navigator.onLine` check (pre-existing test failure)

**Files:**
- Modify: `packages/shared/src/sync/engine.ts:46`
- Test: `packages/shared/tests/sync/engine.test.ts` (existing test `"updates lastSyncTime after successful sync"` — no new test needed)

**Interfaces:**
- Produces: environments without a usable `navigator.onLine` (Node test runner: global `navigator` exists but `onLine` is `undefined`) count as **online**.

- [ ] **Step 1: Confirm the existing test fails**

Run: `pnpm --filter @wikipedia-breadcrumbs/shared test -- tests/sync/engine.test.ts -t "updates lastSyncTime"`
Expected: FAIL — Node has a global `navigator` without `onLine`, so `navigator.onLine` is `undefined` → falsy → `setLastSyncTime` never called.

- [ ] **Step 2: Fix the check**

In `packages/shared/src/sync/engine.ts`, replace line 46:

```typescript
      const isOnline = typeof navigator === "undefined" || navigator.onLine !== false;
```

- [ ] **Step 3: Run the full shared suite**

Run: `pnpm --filter @wikipedia-breadcrumbs/shared test`
Expected: `engine.test.ts` fully green. Only remaining red: the known `tests/db/visits.test.ts` same-ms failure (out of scope).

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/sync/engine.ts
git commit -m "fix(sync): treat missing navigator.onLine as online"
```

---

### Task 4: Shared `restampForUser()` helper

**Files:**
- Create: `packages/shared/src/sync/restamp.ts`
- Modify: `packages/shared/src/sync/index.ts`
- Test: `packages/shared/tests/sync/restamp.test.ts`

**Interfaces:**
- Produces: `restampForUser(db: BreadcrumbsDB, userId: string, opts: { includeSyncedVisits: boolean }): Promise<void>` exported from `@wikipedia-breadcrumbs/shared`. Trails not owned by `userId` get `{ userId, syncStatus: PendingSync }`; visits get `PendingSync` (all visits when `includeSyncedVisits: true`, otherwise only non-Synced ones). `updatedAt` untouched everywhere.

- [ ] **Step 1: Write failing tests**

Create `packages/shared/tests/sync/restamp.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { BreadcrumbsDB } from "../../src/db/schema.js";
import { createTrail, createVisit, StartReason, SourceType, SyncStatus } from "../../src/models/index.js";
import { restampForUser } from "../../src/sync/restamp.js";

describe("restampForUser", () => {
  let db: BreadcrumbsDB;

  beforeEach(async () => {
    db = new BreadcrumbsDB("test-restamp-" + crypto.randomUUID());
    await db.open();
  });

  afterEach(async () => { await db.delete(); });

  function makeVisit(syncStatus: SyncStatus) {
    const v = createVisit({
      trailId: "t1", url: "https://en.wikipedia.org/wiki/Test",
      title: "Test", position: 1, sourceType: SourceType.Link,
      language: "en", articleId: "Test",
    });
    v.syncStatus = syncStatus;
    return v;
  }

  it("stamps foreign/unowned trails with userId + PendingSync, leaves owned ones alone", async () => {
    const foreign = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    foreign.userId = "someone-else";
    foreign.syncStatus = SyncStatus.Synced;
    foreign.updatedAt = "2026-01-01T00:00:00Z";
    const owned = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    owned.userId = "user-123";
    owned.syncStatus = SyncStatus.Synced;
    await db.trails.bulkAdd([foreign, owned]);

    await restampForUser(db, "user-123", { includeSyncedVisits: false });

    const f = await db.trails.get(foreign.id);
    expect(f?.userId).toBe("user-123");
    expect(f?.syncStatus).toBe(SyncStatus.PendingSync);
    expect(f?.updatedAt).toBe("2026-01-01T00:00:00Z"); // untouched
    const o = await db.trails.get(owned.id);
    expect(o?.syncStatus).toBe(SyncStatus.Synced); // untouched
  });

  it("with includeSyncedVisits:false, re-stamps only non-Synced visits", async () => {
    const synced = makeVisit(SyncStatus.Synced);
    const localOnly = makeVisit(SyncStatus.LocalOnly);
    await db.visits.bulkAdd([synced, localOnly]);

    await restampForUser(db, "user-123", { includeSyncedVisits: false });

    expect((await db.visits.get(synced.id))?.syncStatus).toBe(SyncStatus.Synced);
    expect((await db.visits.get(localOnly.id))?.syncStatus).toBe(SyncStatus.PendingSync);
  });

  it("with includeSyncedVisits:true, re-stamps every visit", async () => {
    const synced = makeVisit(SyncStatus.Synced);
    const localOnly = makeVisit(SyncStatus.LocalOnly);
    await db.visits.bulkAdd([synced, localOnly]);

    await restampForUser(db, "user-123", { includeSyncedVisits: true });

    expect((await db.visits.get(synced.id))?.syncStatus).toBe(SyncStatus.PendingSync);
    expect((await db.visits.get(localOnly.id))?.syncStatus).toBe(SyncStatus.PendingSync);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @wikipedia-breadcrumbs/shared test -- tests/sync/restamp.test.ts`
Expected: FAIL — module `../../src/sync/restamp.js` not found.

- [ ] **Step 3: Implement**

Create `packages/shared/src/sync/restamp.ts`:

```typescript
import type { BreadcrumbsDB } from "../db/schema.js";
import { SyncStatus } from "../models/enums.js";

/**
 * Bulk re-stamp local records for a (new) sync user. Used when enabling sync
 * and when upgrading an anonymous account. Deliberately does NOT touch
 * updatedAt: ownership/sync-state changes are not content edits.
 */
export async function restampForUser(
  db: BreadcrumbsDB,
  userId: string,
  opts: { includeSyncedVisits: boolean }
): Promise<void> {
  await db.trails
    .filter((t) => t.userId !== userId)
    .modify({ userId, syncStatus: SyncStatus.PendingSync });

  if (opts.includeSyncedVisits) {
    await db.visits.toCollection().modify({ syncStatus: SyncStatus.PendingSync });
  } else {
    await db.visits
      .filter((v) => v.syncStatus !== SyncStatus.Synced)
      .modify({ syncStatus: SyncStatus.PendingSync });
  }
}
```

Add to `packages/shared/src/sync/index.ts`:

```typescript
export { restampForUser } from "./restamp.js";
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @wikipedia-breadcrumbs/shared test -- tests/sync/restamp.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Build shared (downstream packages consume dist)**

Run: `pnpm --filter @wikipedia-breadcrumbs/shared build`
Expected: clean build, `restampForUser` in `dist`.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/sync/restamp.ts packages/shared/src/sync/index.ts packages/shared/tests/sync/restamp.test.ts
git commit -m "feat(sync): add shared restampForUser bulk helper"
```

---

### Task 5: PWA sync store — guard, `syncError`, use `restampForUser`

**Files:**
- Modify: `packages/pwa/src/lib/stores/sync.svelte.ts`

**Interfaces:**
- Consumes: `restampForUser` (Task 4).
- Produces: `syncState.syncError: string | null` getter; `syncNow()` returns immediately while `_syncing` is true; a report with `errors.length > 0` sets `syncError` to `"<N> record(s) failed to sync"`; exceptions set `syncError` to the error message; both leave details in `lastReport` where available.

- [ ] **Step 1: Apply the store changes**

The PWA has no unit-test harness; this task is verified by type-check/build (Step 2) and the Task 7 manual checklist. In `packages/pwa/src/lib/stores/sync.svelte.ts`:

Add state + getter (after line 14 / inside `syncState`):

```typescript
let _syncError = $state<string | null>(null);
```

```typescript
export const syncState = {
  get syncEnabled() { return _syncEnabled; },
  get lastSyncTime() { return _lastSyncTime; },
  get syncing() { return _syncing; },
  get lastReport() { return _lastReport; },
  get syncError() { return _syncError; },
};
```

Replace the two re-stamp loops. In `enableSync()` (current lines 44-52):

```typescript
  await restampForUser(db, userId, { includeSyncedVisits: false });
```

In `upgradeToAuthenticatedUser()` (current lines 81-92):

```typescript
  await restampForUser(db, newUserId, { includeSyncedVisits: true });
```

Import alongside the existing shared imports (and drop `SyncStatus`, now unused here — keep `trailStore`/`visitStore` only if still referenced; as of this change `hasPendingChanges()` still uses `SyncStatus`, so keep it):

```typescript
import {
  SyncEngine, SupabaseBackend, SyncStatus, restampForUser,
} from "@wikipedia-breadcrumbs/shared";
```

Replace `syncNow()` (current lines 66-78):

```typescript
export async function syncNow(): Promise<void> {
  if (!engine) return;
  if (_syncing) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  _syncing = true;
  _syncError = null;
  try {
    const report = await engine.syncNow();
    _lastReport = report;
    if (report.errors.length > 0) {
      const n = report.errors.length;
      _syncError = `${n} record${n === 1 ? "" : "s"} failed to sync`;
    }
  } catch (err) {
    console.error("[pwa] Sync error:", err);
    _syncError = err instanceof Error ? err.message : String(err);
  } finally {
    _syncing = false;
  }
}
```

- [ ] **Step 2: Type-check / build the PWA**

Run: `pnpm --filter @wikipedia-breadcrumbs/shared build && pnpm --filter @wikipedia-breadcrumbs/pwa build`
(The PWA has no `check`/test script as of this plan. Build requires `packages/pwa/.env` with the `PUBLIC_*` vars — see root `.env.example`.)
Expected: build succeeds with no type errors from the Svelte compiler.

- [ ] **Step 3: Commit**

```bash
git add packages/pwa/src/lib/stores/sync.svelte.ts
git commit -m "feat(pwa): syncNow guard, syncError state, shared restamp helper"
```

---

### Task 6: Extension offscreen handler uses `restampForUser`

**Files:**
- Modify: `packages/extension/src/offscreen/sync-handler.ts:44-56`

**Interfaces:**
- Consumes: `restampForUser` (Task 4). Extension semantics = `includeSyncedVisits: false` (matches current behavior: trails re-stamped when owner differs, only non-Synced visits re-marked).

- [ ] **Step 1: Replace the loops**

In `ensureInitialized()`, replace lines 44-56 with:

```typescript
  // Stamp local records for the current user (bulk; does not touch updatedAt)
  await restampForUser(db, userId, { includeSyncedVisits: false });
```

Update the shared import:

```typescript
import {
  BreadcrumbsDB, SyncEngine, SupabaseBackend, restampForUser,
} from "@wikipedia-breadcrumbs/shared";
```

(`SyncStatus` becomes unused in this file — remove it.)

- [ ] **Step 2: Run extension tests + build**

Run: `pnpm --filter @wikipedia-breadcrumbs/extension test && pnpm --filter @wikipedia-breadcrumbs/extension build`
Expected: 45/45 pass; build clean.

- [ ] **Step 3: Commit**

```bash
git add packages/extension/src/offscreen/sync-handler.ts
git commit -m "refactor(extension): use shared restampForUser in offscreen sync"
```

---

### Task 7: Surface sync errors in the PWA UI

**Files:**
- Modify: `packages/pwa/src/lib/components/SyncStatus.svelte`
- Modify: `packages/pwa/src/routes/settings/+page.svelte` (sync section, after the "Last synced" line)

**Interfaces:**
- Consumes: `syncState.syncError`, `syncState.lastReport` (Task 5).

- [ ] **Step 1: Add the error line to `SyncStatus.svelte`**

Insert between the "Last synced" info-row and the "Device ID" info-row (after current line 59):

```svelte
  {#if syncState.syncError}
    <details class="sync-error">
      <summary>Last sync failed — {syncState.syncError}</summary>
      {#if syncState.lastReport && syncState.lastReport.errors.length > 0}
        <ul>
          {#each syncState.lastReport.errors as error}
            <li>{error}</li>
          {/each}
        </ul>
      {/if}
    </details>
  {/if}
```

Add to the `<style>` block:

```css
  .sync-error { font-size: 13px; color: #dc3545; }
  .sync-error summary { cursor: pointer; }
  .sync-error ul {
    margin: 6px 0 0;
    padding-left: 18px;
    font-size: 12px;
    color: #666;
    font-family: monospace;
  }
```

- [ ] **Step 2: Add the same error line to the settings page**

In `packages/pwa/src/routes/settings/+page.svelte`, directly after the `<p class="help-sm">Last synced: …</p>` element in the authenticated sync section:

```svelte
      {#if syncState.syncError}
        <details class="sync-error">
          <summary>Last sync failed — {syncState.syncError}</summary>
          {#if syncState.lastReport && syncState.lastReport.errors.length > 0}
            <ul>
              {#each syncState.lastReport.errors as error}
                <li>{error}</li>
              {/each}
            </ul>
          {/if}
        </details>
      {/if}
```

Reuse the same `.sync-error` CSS (add to this page's style block; keep values identical).

- [ ] **Step 3: Build + manual verification**

Run: `pnpm --filter @wikipedia-breadcrumbs/pwa build`
Expected: clean.

Manual checklist (dev server, sync enabled):
1. Normal sync → no error line, layout identical to before.
2. Kill network mid-sync or point `PUBLIC_SUPABASE_URL` at an unreachable host → "Last sync failed — …" appears in both SyncStatus and settings; expanding shows per-record/exception detail.
3. Trigger "Sync now" twice fast → second click is a no-op (guard).
4. Successful sync afterwards clears the error line.

- [ ] **Step 4: Commit**

```bash
git add packages/pwa/src/lib/components/SyncStatus.svelte packages/pwa/src/routes/settings/+page.svelte
git commit -m "feat(pwa): surface sync errors in SyncStatus and settings"
```

---

## Final verification

- [ ] `pnpm -r test` — everything green except the known `visits.test.ts` same-ms failure.
- [ ] `pnpm build` — all packages build.
- [ ] Manual pass per Task 7 checklist.
- [ ] Do NOT merge — hand back to the operator for review/manual testing.
