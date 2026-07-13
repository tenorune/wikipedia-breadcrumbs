# PWA Dexie liveQuery Adoption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the PWA's imperative `loadData()`/`loadTrails()` loading (on mount, on `visibilitychange`, after every mutation) with reactive Dexie `liveQuery` subscriptions, eliminating the N+1 per-trail visit queries.

**Architecture:** A `useLiveQuery` rune adapter (`.svelte.ts`) bridges Dexie observables to Svelte 5 state. Plain, unit-testable querier functions in `$lib/queries.ts` fetch trails+visits in two whole-table reads and group in memory. The three views (home, TrailList, TrailDetail) consume queriers through the adapter; all reload-after-mutation calls and all three `visibilitychange` listeners are deleted.

**Tech Stack:** Dexie 4 `liveQuery`, Svelte 5 runes, Vitest + fake-indexeddb (harness added by the service-worker plan; if executing this plan first, copy Task 3 Step 1 of `2026-07-13-service-worker-offline-update.md` to create it).

**Spec:** `docs/superpowers/specs/2026-07-13-pwa-livequery-design.md`

## Global Constraints

- **Toolchain first:** reconcile the pnpm 10→11 lockfile drift before installing (see `docs/ROADMAP.md` chores). PWA build needs `packages/pwa/.env` (`PUBLIC_*` vars).
- Work on a feature branch off `main`; commits end with the `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` trailer.
- Behavior parity is the bar: identical display names, ordering (trails newest-`startedAt` first; visits by `position`), soft-delete filtering (`deletedAt === null`), and search text as today's code produces.
- Keep untouched: sort prefs (localStorage), title-wave animation, online/offline listeners, tick interval, import/export logic, settings page, sync store, extension.
- Testing deviation from spec (documented): the `useLiveQuery` adapter itself is verified by build + manual checks, not unit tests — compiling rune modules in vitest needs the Svelte plugin and isn't worth the harness complexity for ~15 lines. The querier functions (where the logic lives) are fully unit-tested.

---

### Task 1: Dependencies + `useLiveQuery` adapter

**Files:**
- Modify: `packages/pwa/package.json`
- Create: `packages/pwa/src/lib/live-query.svelte.ts`

**Interfaces:**
- Produces: `useLiveQuery<T>(querier: () => T | Promise<T>, initial: T, deps?: () => unknown): { readonly current: T }` from `$lib/live-query.svelte`. Must be called during component init. `deps` registers reactive dependencies (e.g. a route param) that force re-subscription.

- [ ] **Step 1: Add dependencies**

`packages/pwa/package.json`: add to `dependencies` (dexie matches shared's range; needed directly for the `liveQuery` import under pnpm strict node_modules):

```json
    "dexie": "^4.0.0"
```

and to `devDependencies`:

```json
    "fake-indexeddb": "^6.0.0"
```

Run `pnpm install` at the workspace root.

- [ ] **Step 2: Create the adapter**

Create `packages/pwa/src/lib/live-query.svelte.ts`:

```typescript
import { liveQuery } from "dexie";

/**
 * Bridges a Dexie liveQuery to Svelte 5 state. liveQuery re-runs the querier
 * whenever any Dexie table it read from changes (same tab or another tab).
 * `deps` exists because the querier runs outside effect tracking: pass any
 * reactive values the querier closes over (e.g. a route param) so the
 * subscription is torn down and recreated when they change.
 * On querier error, the last good value is kept and the error logged.
 */
export function useLiveQuery<T>(
  querier: () => T | Promise<T>,
  initial: T,
  deps?: () => unknown
) {
  let value = $state(initial);
  $effect(() => {
    deps?.();
    const sub = liveQuery(querier).subscribe({
      next: (v) => { value = v; },
      error: (err) => console.error("[pwa] liveQuery error:", err),
    });
    return () => sub.unsubscribe();
  });
  return {
    get current() { return value; },
  };
}
```

- [ ] **Step 3: Verify it compiles**

Run: `pnpm --filter @wikipedia-breadcrumbs/shared build && pnpm --filter @wikipedia-breadcrumbs/pwa build`
Expected: clean build (module compiles even while unused).

- [ ] **Step 4: Commit**

```bash
git add packages/pwa/package.json packages/pwa/src/lib/live-query.svelte.ts pnpm-lock.yaml
git commit -m "feat(pwa): add dexie dep and useLiveQuery rune adapter"
```

---

### Task 2: Querier functions (TDD)

**Files:**
- Create: `packages/pwa/src/lib/queries.ts`
- Test: `packages/pwa/tests/queries.test.ts`

**Interfaces:**
- Produces (from `$lib/queries`):
  - `interface TrailSummary { trail: Trail; displayName: string; visitCount: number; lastDiscovered: string; searchText: string }`
  - `interface TrailData { summaries: TrailSummary[]; totalVisits: number; totalNotes: number }` — `summaries` sorted newest-`startedAt` first (parity with `trailStore.getAll()`)
  - `interface TrailDetailData { trail: Trail | null; visits: Visit[]; mergeCandidates: Array<{ id: string; displayName: string }> }` — `visits` sorted by `position`
  - `queryTrailData(db: BreadcrumbsDB): Promise<TrailData>`
  - `queryTrailDetail(db: BreadcrumbsDB, trailId: string): Promise<TrailDetailData>`

- [ ] **Step 1: Write failing tests**

Create `packages/pwa/tests/queries.test.ts`:

```typescript
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  BreadcrumbsDB, createTrail, createVisit, StartReason, SourceType,
} from "@wikipedia-breadcrumbs/shared";
import { queryTrailData, queryTrailDetail } from "../src/lib/queries";

function makeVisit(trailId: string, position: number, title: string, note: string | null = null) {
  const v = createVisit({
    trailId, url: `https://en.wikipedia.org/wiki/${title}`,
    title, position, sourceType: SourceType.Link,
    language: "en", articleId: title,
  });
  v.note = note;
  return v;
}

describe("queries", () => {
  let db: BreadcrumbsDB;

  beforeEach(async () => {
    db = new BreadcrumbsDB("test-queries-" + crypto.randomUUID());
    await db.open();
  });

  afterEach(async () => { await db.delete(); });

  it("builds summaries newest-startedAt-first with names, counts, lastDiscovered, searchText", async () => {
    const older = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    older.startedAt = "2026-01-01T00:00:00Z";
    const newer = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    newer.startedAt = "2026-02-01T00:00:00Z";
    await db.trails.bulkAdd([older, newer]);
    const v1 = makeVisit(older.id, 1, "Alpha", "my note");
    const v2 = makeVisit(older.id, 2, "Beta");
    v2.timestamp = "2026-01-05T00:00:00Z";
    await db.visits.bulkAdd([v2, v1]); // insertion order must not matter

    const data = await queryTrailData(db);

    expect(data.summaries.map((s) => s.trail.id)).toEqual([newer.id, older.id]);
    const oldSummary = data.summaries[1];
    expect(oldSummary.displayName).toBe("Alpha → Beta");
    expect(oldSummary.visitCount).toBe(2);
    expect(oldSummary.lastDiscovered).toBe("2026-01-05T00:00:00Z");
    expect(oldSummary.searchText).toContain("alpha");
    expect(oldSummary.searchText).toContain("my note");
    const newSummary = data.summaries[0];
    expect(newSummary.displayName).toBe("Empty trail");
    expect(newSummary.lastDiscovered).toBe(newer.startedAt);
  });

  it("uses trail.name when set, single visit title when one visit", async () => {
    const named = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    named.name = "My Trail";
    const single = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    await db.trails.bulkAdd([named, single]);
    await db.visits.add(makeVisit(single.id, 1, "Solo"));

    const { summaries } = await queryTrailData(db);
    const byId = new Map(summaries.map((s) => [s.trail.id, s]));
    expect(byId.get(named.id)?.displayName).toBe("My Trail");
    expect(byId.get(single.id)?.displayName).toBe("Solo");
  });

  it("excludes soft-deleted trails and visits, counts totals", async () => {
    const kept = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    kept.note = "trail note";
    const deleted = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    deleted.deletedAt = "2026-01-01T00:00:00Z";
    await db.trails.bulkAdd([kept, deleted]);
    const liveVisit = makeVisit(kept.id, 1, "Live", "visit note");
    const deadVisit = makeVisit(kept.id, 2, "Dead");
    deadVisit.deletedAt = "2026-01-01T00:00:00Z";
    await db.visits.bulkAdd([liveVisit, deadVisit]);

    const data = await queryTrailData(db);
    expect(data.summaries).toHaveLength(1);
    expect(data.summaries[0].visitCount).toBe(1);
    expect(data.totalVisits).toBe(1);
    expect(data.totalNotes).toBe(2); // trail note + visit note
  });

  it("queryTrailDetail returns position-sorted visits and merge candidates excluding self", async () => {
    const me = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    const other = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    await db.trails.bulkAdd([me, other]);
    await db.visits.bulkAdd([
      makeVisit(me.id, 2, "Second"),
      makeVisit(me.id, 1, "First"),
      makeVisit(other.id, 1, "Elsewhere"),
    ]);

    const detail = await queryTrailDetail(db, me.id);
    expect(detail.trail?.id).toBe(me.id);
    expect(detail.visits.map((v) => v.title)).toEqual(["First", "Second"]);
    expect(detail.mergeCandidates).toEqual([{ id: other.id, displayName: "Elsewhere" }]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @wikipedia-breadcrumbs/pwa test`
Expected: FAIL — `../src/lib/queries` not found.

- [ ] **Step 3: Implement**

Create `packages/pwa/src/lib/queries.ts`:

```typescript
import type { BreadcrumbsDB, Trail, Visit } from "@wikipedia-breadcrumbs/shared";

export interface TrailSummary {
  trail: Trail;
  displayName: string;
  visitCount: number;
  lastDiscovered: string; // timestamp of last visit, or trail.startedAt
  searchText: string;
}

export interface TrailData {
  summaries: TrailSummary[]; // newest startedAt first (parity with trailStore.getAll)
  totalVisits: number;
  totalNotes: number;
}

export interface TrailDetailData {
  trail: Trail | null;
  visits: Visit[]; // position order
  mergeCandidates: Array<{ id: string; displayName: string }>;
}

function displayNameFor(trail: Trail, visits: Visit[]): string {
  if (trail.name) return trail.name;
  if (visits.length === 0) return "Empty trail";
  if (visits.length === 1) return visits[0].title;
  return `${visits[0].title} → ${visits[visits.length - 1].title}`;
}

/**
 * Two whole-table reads + in-memory grouping instead of one visit query per
 * trail. Inside a liveQuery querier, both table reads are tracked, so any
 * trail or visit write re-runs the query.
 */
export async function queryTrailData(db: BreadcrumbsDB): Promise<TrailData> {
  const [trails, visits] = await Promise.all([
    db.trails.filter((t) => t.deletedAt === null).sortBy("startedAt"),
    db.visits.filter((v) => v.deletedAt === null).toArray(),
  ]);
  trails.reverse();

  const byTrail = new Map<string, Visit[]>();
  for (const v of visits) {
    const list = byTrail.get(v.trailId);
    if (list) list.push(v);
    else byTrail.set(v.trailId, [v]);
  }
  for (const list of byTrail.values()) list.sort((a, b) => a.position - b.position);

  const summaries = trails.map((trail) => {
    const tv = byTrail.get(trail.id) ?? [];
    const parts = [trail.name ?? "", trail.note ?? ""];
    for (const v of tv) parts.push(v.title, v.note ?? "");
    return {
      trail,
      displayName: displayNameFor(trail, tv),
      visitCount: tv.length,
      lastDiscovered: tv.length > 0 ? tv[tv.length - 1].timestamp : trail.startedAt,
      searchText: parts.join(" ").toLowerCase(),
    };
  });

  const totalNotes =
    trails.filter((t) => t.note).length + visits.filter((v) => v.note).length;
  return { summaries, totalVisits: visits.length, totalNotes };
}

export async function queryTrailDetail(
  db: BreadcrumbsDB,
  trailId: string
): Promise<TrailDetailData> {
  const [{ summaries }, trail, visits] = await Promise.all([
    queryTrailData(db),
    db.trails.get(trailId),
    db.visits.where("trailId").equals(trailId).filter((v) => v.deletedAt === null).sortBy("position"),
  ]);
  return {
    trail: trail ?? null,
    visits,
    mergeCandidates: summaries
      .filter((s) => s.trail.id !== trailId)
      .map((s) => ({ id: s.trail.id, displayName: s.displayName })),
  };
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @wikipedia-breadcrumbs/pwa test`
Expected: PASS (4 new tests; SW registration tests still green if present).

- [ ] **Step 5: Commit**

```bash
git add packages/pwa/src/lib/queries.ts packages/pwa/tests/queries.test.ts
git commit -m "feat(pwa): N+1-free trail summary and detail queriers"
```

---

### Task 3: Convert the home page

**Files:**
- Modify: `packages/pwa/src/routes/+page.svelte`

**Interfaces:**
- Consumes: `useLiveQuery` (Task 1), `queryTrailData` (Task 2), existing `hasPendingChanges` from the sync store.

- [ ] **Step 1: Replace imperative state with liveQuery deriveds**

In the script block of `packages/pwa/src/routes/+page.svelte`:

Remove: the `trailStore, visitStore` and `Trail` imports, `const ts/vs` (lines 30-31), the six `$state` declarations `loaded/totalTrails/totalVisits/totalNotes/starredTrails/recentTrails` (lines 33-38), `let pendingChanges = $state(false)` (line 40), and the whole `loadData()` function (lines 53-93).

Add imports:

```typescript
  import { useLiveQuery } from "$lib/live-query.svelte";
  import { queryTrailData, type TrailData } from "$lib/queries";
```

Add (where the removed state was):

```typescript
  const home = useLiveQuery(() => queryTrailData(db), null as TrailData | null);
  const pending = useLiveQuery(() => hasPendingChanges(), false);

  const loaded = $derived(home.current !== null);
  const totalTrails = $derived(home.current?.summaries.length ?? 0);
  const totalVisits = $derived(home.current?.totalVisits ?? 0);
  const totalNotes = $derived(home.current?.totalNotes ?? 0);
  const pendingChanges = $derived(pending.current);

  const starredTrails = $derived.by(() =>
    (home.current?.summaries ?? [])
      .filter((s) => s.trail.isStarred)
      .sort((a, b) => b.trail.updatedAt.localeCompare(a.trail.updatedAt))
      .map((s) => ({ id: s.trail.id, displayName: s.displayName, updatedAt: s.trail.updatedAt }))
  );
  const recentTrails = $derived.by(() =>
    (home.current?.summaries ?? [])
      .filter((s) => !s.trail.isStarred)
      .sort((a, b) => b.trail.updatedAt.localeCompare(a.trail.updatedAt))
      .slice(0, 5)
      .map((s) => ({ id: s.trail.id, displayName: s.displayName, updatedAt: s.trail.updatedAt }))
  );
```

Simplify `handleSyncWithWave` (pendingChanges now updates itself via liveQuery):

```typescript
  async function handleSyncWithWave() {
    await syncNow();
  }
```

In `onMount` (lines 97-118): delete `loadData();`, the `onVisible` const, and its add/removeEventListener lines. **Keep** the standalone-wave block, online/offline listeners, and the tick interval.

The template needs no changes (all names preserved).

- [ ] **Step 2: Build + manual check**

Run: `pnpm --filter @wikipedia-breadcrumbs/pwa build`
Manual (dev server): home shows the same stats/starred/recent as before; starring a trail from another view updates home without navigation.

- [ ] **Step 3: Commit**

```bash
git add packages/pwa/src/routes/+page.svelte
git commit -m "refactor(pwa): home page reads via liveQuery"
```

---

### Task 4: Convert TrailList

**Files:**
- Modify: `packages/pwa/src/lib/components/TrailList.svelte`

**Interfaces:**
- Consumes: `useLiveQuery`, `queryTrailData`, `TrailSummary`.

- [ ] **Step 1: Script changes**

Remove: `onMount` import and the whole `onMount(...)` block (lines 74-79); the `visitStore` import and `const vs` (line 13); the `Trail` type import; the five `$state` declarations `loaded/trails/displayNames/visitCounts/lastDiscovered/searchTexts` (lines 17-22); the whole `loadTrails()` function (lines 38-72).

Add imports:

```typescript
  import { useLiveQuery } from "$lib/live-query.svelte";
  import { queryTrailData, type TrailData, type TrailSummary } from "$lib/queries";
```

Add:

```typescript
  const data = useLiveQuery(() => queryTrailData(db), null as TrailData | null);
  const loaded = $derived(data.current !== null);
  const summaries = $derived(data.current?.summaries ?? []);
```

Replace `filtered` (lines 81-99) to operate on summaries:

```typescript
  const filtered = $derived.by(() => {
    const q = search.trim().toLowerCase();
    let list = summaries.filter((s) => !q || s.searchText.includes(q));

    if (sortMode === "recent") {
      list = [...list].sort((a, b) => b.trail.updatedAt.localeCompare(a.trail.updatedAt));
    } else if (sortMode === "oldest") {
      list = [...list].sort((a, b) => a.trail.startedAt.localeCompare(b.trail.startedAt));
    } else if (sortMode === "starred") {
      list = [...list].sort((a, b) => {
        if (a.trail.isStarred === b.trail.isStarred) return b.trail.updatedAt.localeCompare(a.trail.updatedAt);
        return a.trail.isStarred ? -1 : 1;
      });
    }
    return list;
  });
```

Update the mutation handlers — no reloads, summary-based:

```typescript
  async function toggleStar(summary: TrailSummary, e: Event) {
    e.stopPropagation();
    await ts.update(summary.trail.id, { isStarred: !summary.trail.isStarred });
  }

  async function deleteTrail(summary: TrailSummary, e: Event) {
    e.stopPropagation();
    confirmState = {
      message: `Delete "${summary.displayName}"?`,
      action: async () => { await ts.softDelete(summary.trail.id); },
    };
  }
```

In `doImport()` (line 189-199): delete the final `await loadTrails();`.

- [ ] **Step 2: Template changes (list items only)**

Replace the `{#each}` block (lines 278-306) — same markup, summary-based bindings:

```svelte
    {#each filtered as summary (summary.trail.id)}
      <li class="item">
        <button
          class="star"
          class:starred={summary.trail.isStarred}
          onclick={(e) => toggleStar(summary, e)}
          title={summary.trail.isStarred ? "Unstar" : "Star"}
          aria-label={summary.trail.isStarred ? "Unstar trail" : "Star trail"}
        >
          {summary.trail.isStarred ? "★" : "☆"}
        </button>

        <button class="info" onclick={() => goto("/trails/" + summary.trail.id)}>
          <span class="name">{summary.displayName}</span>
          <span class="meta">
            {summary.visitCount} pages &middot; {formatDate(summary.lastDiscovered)}
          </span>
        </button>

        <button
          class="delete"
          onclick={(e) => deleteTrail(summary, e)}
          title="Delete trail"
          aria-label="Delete trail"
        >
          ✕
        </button>
      </li>
    {/each}
```

- [ ] **Step 3: Build + manual check**

Run: `pnpm --filter @wikipedia-breadcrumbs/pwa build`
Manual: list renders identically (names, counts, dates); search and all three sort modes work; star/delete update the list in place with no flicker; import updates the list without a manual reload.

- [ ] **Step 4: Commit**

```bash
git add packages/pwa/src/lib/components/TrailList.svelte
git commit -m "refactor(pwa): TrailList reads via liveQuery"
```

---

### Task 5: Convert TrailDetail

**Files:**
- Modify: `packages/pwa/src/lib/components/TrailDetail.svelte`

**Interfaces:**
- Consumes: `useLiveQuery` (with `deps` — `trailId` is a prop that can change without remount when navigating between trails), `queryTrailDetail`.

- [ ] **Step 1: Script changes**

Remove: the four `$state` declarations `trail/visits/allTrails/trailDisplayNames` (lines 21-24); the whole `loadData()` function (lines 88-113); in `onMount` (lines 115-124) the `loadData();` call, the `onVisible` const and its add/removeEventListener lines (keep sort-pref loading and `getLanguageBadgeSettings`).

Add imports:

```typescript
  import { useLiveQuery } from "$lib/live-query.svelte";
  import { queryTrailDetail, type TrailDetailData } from "$lib/queries";
```

Add (note the `deps` argument — required so navigating from one trail page to another re-subscribes):

```typescript
  const detail = useLiveQuery(
    () => queryTrailDetail(db, trailId),
    null as TrailDetailData | null,
    () => trailId
  );
  const trail = $derived(detail.current?.trail ?? null);
  const visits = $derived(detail.current?.visits ?? []);
  const allTrails = $derived(detail.current?.mergeCandidates ?? []);
  const trailDisplayNames = $derived(
    Object.fromEntries((detail.current?.mergeCandidates ?? []).map((c) => [c.id, c.displayName]))
  );
```

(`allTrails` keeps its name: the merge-dropdown template only uses `t.id`, which `{ id, displayName }` provides — no template changes needed.)

Delete every `await loadData();` call — seven sites: `saveName()` (line 204), `saveNote()` (line 219), `toggleStar()` (line 229), `handleUpdateNote()` (line 234), the delete-visit confirm action (line 243), the split confirm action (line 252), the merge confirm action (line 262). The surrounding lines (state resets, `__dismissTime` stamps) stay.

- [ ] **Step 2: Build + manual check**

Run: `pnpm --filter @wikipedia-breadcrumbs/pwa build`
Manual: open a trail — header, meta, notes, visit list identical. Rename/star/note-edit/delete-visit/split/merge all reflect instantly without reload; the merge picker lists the other trails by display name; focused view still works; sort prefs persist. Navigate directly between two trail URLs (e.g. via home links) — content switches correctly (the `deps` re-subscription).

- [ ] **Step 3: Commit**

```bash
git add packages/pwa/src/lib/components/TrailDetail.svelte
git commit -m "refactor(pwa): TrailDetail reads via liveQuery"
```

---

## Final verification

- [ ] `pnpm --filter @wikipedia-breadcrumbs/pwa test` — querier tests green.
- [ ] `grep -rn "visibilitychange" packages/pwa/src/routes/+page.svelte packages/pwa/src/lib/components/TrailList.svelte packages/pwa/src/lib/components/TrailDetail.svelte` → no matches (all three reload listeners gone; the sync store's own visibility-gated interval is untouched).
- [ ] `grep -rn "loadData\|loadTrails" packages/pwa/src` → no matches.
- [ ] Cross-tab: two tabs open, star/rename in one → other updates without focus/navigation.
- [ ] Sync: run a sync that pulls changes → views update live.
- [ ] Do NOT merge — hand back to the operator for review/manual testing.
