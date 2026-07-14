# PWA Dexie liveQuery Adoption — Design Spec

## Summary

Replace the PWA's pull-based data loading (`loadData()`/`loadTrails()` on mount, on
`visibilitychange`, and after every mutation) with reactive Dexie `liveQuery`
subscriptions via a small Svelte 5 rune adapter. Kills the N+1 per-trail visit loads
and the three duplicate `visibilitychange` listeners. Covers analysis opt #2.
PWA-only; the extension keeps its current loading.

## Motivation

Three views load data imperatively and re-load it wholesale:

- Home (`routes/+page.svelte:53-93`): `loadData()` fetches all trails, then calls
  `visitStore.getByTrailId(t.id)` per trail for display names — N+1 queries.
- `TrailList.svelte:38-72`: same N+1 in `loadTrails()`.
- `TrailDetail.svelte:88-113`: loads trail + visits, plus per-candidate
  `getByTrailId()` for the merge picker — another N+1.
- Every mutation ends with `await loadData()` / `await loadTrails()` (10+ call sites),
  and each of the three views registers its own identical `visibilitychange` reload
  listener.

`liveQuery` makes the views observe the DB instead: any Dexie write — user mutation,
import, or a sync pull-merge — re-runs the affected queries automatically, including
across tabs (Dexie 4 propagates change events via BroadcastChannel).

## Changes

### 1. Rune adapter: `useLiveQuery`

New `packages/pwa/src/lib/live-query.svelte.ts`:

```typescript
import { liveQuery } from "dexie";

export function useLiveQuery<T>(querier: () => T | Promise<T>, initial: T) {
  let value = $state(initial);
  $effect(() => {
    const sub = liveQuery(querier).subscribe({
      next: (v) => (value = v),
      error: (err) => console.error("[pwa] liveQuery error:", err),
    });
    return () => sub.unsubscribe();
  });
  return {
    get current() { return value; },
  };
}
```

- Must be called during component initialization (rune `$effect` rules) — same
  constraint as any rune-based helper.
- On querier error the last good value is retained and the error logged; views render
  stale-but-valid data rather than crashing.
- `dexie` (same `^4.0.0` as shared) is added as a direct dependency of
  `packages/pwa` — required for the `liveQuery` import under pnpm's strict
  node_modules.

### 2. N+1 elimination inside the queriers

A querier that reads trails and visits does so in two whole-table queries and groups
in memory — `liveQuery` tracks every Dexie read inside the querier, so the result
stays live with respect to both tables:

```typescript
const data = useLiveQuery(async () => {
  const [trails, visits] = await Promise.all([
    db.trails.filter((t) => !t.deletedAt).toArray(),
    db.visits.filter((v) => !v.deletedAt).toArray(),
  ]);
  const byTrail = new Map<string, Visit[]>();
  for (const v of visits) { /* group by v.trailId */ }
  return buildSummaries(trails, byTrail); // existing display-name logic, unchanged
}, []);
```

Existing display-name and count computation moves into the queriers as-is; only the
per-trail `getByTrailId()` calls disappear.

### 3. Per-view conversion

- **Home `+page.svelte`**: `loadData()` → one `useLiveQuery` summary query as above.
- **`TrailList.svelte`**: `loadTrails()` → same summary query (shared as a
  `$lib` query helper so home and list don't duplicate the querier). Post-import
  reload call (`:198`) deleted — `executeImport()` writes through Dexie, so the query
  re-runs on its own.
- **`TrailDetail.svelte`**: one querier keyed on `trailId` returning
  `{ trail, visits, mergeCandidates }`; merge-candidate display names come from the
  same grouped map. All `await loadData()` calls after update/delete/split/merge are
  deleted — mutations become plain `await store.…()` calls.
- All three `visibilitychange` listeners (`+page.svelte:105-110`,
  `TrailList.svelte:76-78`, `TrailDetail.svelte:121-123`) are deleted.

### 4. Untouched

Sort preferences (localStorage), the title-wave animation, import/export logic,
settings page, and the sync store. The extension is explicitly not converted.

## Testing

- Unit tests for `useLiveQuery` and the shared summary querier using
  `fake-indexeddb` (the same approach shared's tests use): write → assert emitted
  value updates; unsubscribe on teardown.
- If the PWA package has no vitest harness yet, adding a minimal one is part of this
  work (verify during planning; extension and shared already have harnesses to copy).
- Manual checklist: mutate in one tab, watch a second tab update; run a sync pull and
  watch views update without navigation.

## Out of scope

- Extension adoption of liveQuery.
- Pagination/virtualization of long lists (whole-table reads match current behavior).
- Any change to the stores' write paths (covered by the sync write path spec).
