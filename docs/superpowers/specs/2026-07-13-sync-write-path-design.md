# Sync Write Path & Error Surfacing — Design Spec

## Summary

Batch the sync write path end to end — one Supabase upsert per table instead of one
per record, bulk Dexie writes for mark-Synced and user re-stamping — add an in-flight
guard to the PWA's `syncNow()`, and surface sync failures in the UI. Covers analysis
opt #1, opt #5, and UX quick-win #1.

## Motivation

- `SupabaseBackend.upsertAll()` (`packages/shared/src/sync/supabase-backend.ts:35-46`)
  issues one HTTP round trip per record. A first sync of a few hundred visits is a few
  hundred sequential requests.
- The engine's push loop (`packages/shared/src/sync/engine.ts:63-89`) marks records
  Synced one `update()` at a time, and the PWA/extension re-stamp loops
  (`packages/pwa/src/lib/stores/sync.svelte.ts:45-52,82-92`,
  `packages/extension/src/offscreen/sync-handler.ts:44-56`) do one `update()` per row.
- The PWA store's `syncNow()` has no in-flight guard of its own, and a failed sync is
  invisible: the `catch` only does `console.error`, `lastReport` is stored but never
  rendered, and `SyncStatus.svelte` shows the same UI whether the last sync succeeded
  or failed. This violates the ui-ux-guidelines principle "the app tells the truth."

## Changes

### 1. Batch Supabase upserts (`supabase-backend.ts`)

`upsertAll(table, records)` sends the whole array in one call —
`client.from(table).upsert(records)` — chunked at 500 records per request.

- Return shape stays `SyncResult[]` (one entry per record), so `engine.ts` callers
  don't change: a successful chunk yields `success: true` for every record in it; a
  failed chunk yields `success: false` with the chunk's `error.message` for every
  record in it.
- **Accepted trade-off:** per-record failure granularity within a chunk is lost. A
  single bad record fails its whole chunk. Acceptable because failures here are
  auth/RLS/network-shaped (whole-batch) far more often than per-row.
- `pushVisits()` keeps injecting `user_id` into each mapped record before the batch
  call. Pull paths are untouched.

### 2. Bulk mark-Synced in the engine (`engine.ts:63-89`)

Collect the successful ids from the push results, then one bulk write per table:

```typescript
const okIds = results.filter((r) => r.success).map((r) => r.id);
await this.db.trails.where("id").anyOf(okIds).modify({ syncStatus: SyncStatus.Synced });
report.pushed.trails += okIds.length;
```

Failed results still append per-record messages to `report.errors`. Same pattern for
visits.

**Deliberate behavior change:** the current code routes through `trailStore.update()`
/ `visitStore.update()`, which re-stamps `updatedAt` at sync time. The bulk `modify`
writes `syncStatus` only, leaving `updatedAt` as it was when the record was pushed.
This is a fix: marking a record Synced should not make the local copy look newer than
the remote copy it was just pushed from.

### 3. Shared re-stamp helper

New shared function (in `packages/shared/src/sync/`), replacing three hand-rolled
loops:

```typescript
export async function restampForUser(
  db: BreadcrumbsDB,
  userId: string,
  opts: { includeSyncedVisits: boolean }
): Promise<void>
```

- Trails: every trail not already owned by the target user (`trail.userId !== userId`)
  gets `{ userId, syncStatus: PendingSync }` via bulk `modify`. (`updatedAt` is deliberately not touched — same reasoning as §2.)
- Visits: with `includeSyncedVisits: false`, only visits where
  `syncStatus !== Synced` become `PendingSync` (the `enableSync` semantics used by the
  PWA store and the extension handler); with `true`, all visits become `PendingSync`
  (the `upgradeToAuthenticatedUser` semantics that force a full re-push).

Callers updated: `sync.svelte.ts` `enableSync()` and `upgradeToAuthenticatedUser()`,
and the extension's `offscreen/sync-handler.ts`.

### 4. `syncNow()` guard + error state (`sync.svelte.ts`)

- First line of `syncNow()`: `if (_syncing) return;` (the engine's own `syncing` flag
  stays as backstop).
- New `_syncError = $state<string | null>(null)`, exposed as `syncState.syncError`:
  - set from the `catch` (exception message) — replacing console-only logging;
  - set to a summary when a completed report has `errors.length > 0`
    (e.g. `"3 records failed to sync"`);
  - cleared at the start of each sync and left `null` after a clean run.
- `_lastReport` is still set on success; on exception it is left as the previous
  report (the error state carries the failure).

### 5. Surface errors in the UI

- `SyncStatus.svelte`: when `syncState.syncError` is set, an error line below "Last
  synced" — red text, e.g. "Last sync failed — 3 records failed to sync" — inside a
  `<details>` whose expanded body lists `lastReport.errors`. No layout shift when
  there is no error (line simply absent; the surrounding rows keep their positions).
- Settings page sync section (`routes/settings/+page.svelte:176-187`): the same error
  line, same source of truth.
- Wording follows ui-ux-guidelines: state what failed, no jargon dump in the collapsed
  line.

## Error handling summary

| Failure | Before | After |
|---|---|---|
| Whole-sync exception | `console.error` only | `syncError` set, shown in both UIs |
| Per-record/chunk push failure | in `report.errors`, never shown | summarized in `syncError`, details expandable |
| Concurrent `syncNow()` | engine returns early with error string in report | store returns before engine is called |

## Testing

- `tests/sync/supabase-backend.test.ts`: assert one `upsert` call with the full array;
  add a chunking test (e.g. 1001 records → 3 calls) and a failed-chunk test (all
  records in chunk reported failed).
- `tests/sync/engine.test.ts`: existing push tests updated to expect bulk `modify`
  effects (assert resulting `syncStatus` in the DB rather than store-method calls);
  add an assertion that `updatedAt` is unchanged after mark-Synced.
- While in this file, fix the pre-existing env failure: the engine's
  `navigator.onLine` check (`engine.ts:47-49`) becomes
  `typeof navigator === "undefined" || navigator.onLine !== false` so Node (undefined
  `onLine`) counts as online.
- New tests for `restampForUser` covering both `includeSyncedVisits` modes.
- PWA store guard: if the PWA has no test harness, guard behavior is verified in the
  plan's manual checklist instead.

## Out of scope

- Retry/backoff or an offline queue for failed pushes.
- Conflict-resolution UI (conflict logging behavior is unchanged).
- Supabase schema / RLS changes — batch upsert uses the existing tables as-is.
- Extension popup/history UI for sync errors (extension gets the shared helper and
  engine improvements, but new error UI is PWA-only for now).
