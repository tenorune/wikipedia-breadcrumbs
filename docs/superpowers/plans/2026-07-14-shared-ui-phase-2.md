# Shared UI Phase 2 — TrailList/TrailDetail Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the duplicated TrailList and TrailDetail components (plus their shared ConfirmDialog dependency) into `@wikipedia-breadcrumbs/ui`, completing the rollout order of the shared-UI spec.

**Architecture:** Shared components are presentational — data enters via props, platform behavior via callbacks (per the spec's design rule). TrailList receives precomputed `TrailSummary[]` and fires `onSelectTrail` / `onToggleStar` / `onDeleteTrail`; the apps own those DB writes (PWA: liveQuery refreshes automatically; extension: writes + chrome messages + `refresh()`). TrailDetail receives `trail` / `visits` / `mergeCandidates` and keeps the DB mutations that are byte-identical in both apps (name/note/star edits, visit note/delete, split, merge, export) inside the component, exposing post-write hooks (`onChanged`, `onSplitDone`, `onMergeDone`) that the extension augments with its chrome runtime messages. The PWA-only title-wave animation stays in the PWA via an optional `header` snippet.

**Tech Stack:** Svelte 5 (runes, snippets), raw-`.svelte` shared package (no build step), Dexie via `@wikipedia-breadcrumbs/shared`, svelte-check.

**Spec:** `docs/superpowers/specs/2026-07-13-shared-ui-package-design.md` (TrailList/TrailDetail sections). Phase 1 (package scaffold + ImportDialog + VisitCard) already landed on `dev`.

## Global Constraints

- **Base branch:** create `feat/shared-ui-phase-2` off **`dev`**. Baseline on `dev` is green: shared 129/129 (one known same-ms timing flake in `visits.test.ts`, out of scope), pwa 10/10, extension 45/45; all builds green.
- **Commit trailer** on every commit: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- **Dependency direction:** `ui → shared` only. `packages/ui` ships raw `.svelte` (no build step, no new deps, no vitest harness — its CI gate is `pnpm --filter @wikipedia-breadcrumbs/ui check`).
- **PWA styling/copy is canonical** (spec: "the PWA variants are the more recent and become canonical"). No design tokens (YAGNI, per spec).
- **Spec-mandated unification:** both apps show the active badge and full date-range meta in TrailList (truthful status display).
- **Do not touch:** `packages/shared` (no changes needed), the extension popup, PWA home/settings routes, sync code, or anything else outside the files listed per task.
- **Env/commands:**
  - ui check: `pnpm --filter @wikipedia-breadcrumbs/ui check`
  - pwa: `pnpm --filter @wikipedia-breadcrumbs/pwa test` / `build` (build needs `packages/pwa/.env`, present locally)
  - extension: `pnpm --filter @wikipedia-breadcrumbs/extension test` / `build`

## Locked Decisions (with rationale)

1. **ConfirmDialog moves to `packages/ui`** (PWA styling canon). Verified: its only consumers in either app are the four TrailList/TrailDetail files this plan rewrites, so both app copies are deleted by the end (extension copy in Task 7, PWA copy in Task 6). Shared TrailList/TrailDetail import it relatively (`./ConfirmDialog.svelte`) so confirm flows stay internal — no behavior change, and it satisfies the guidelines' "same style of confirmation dialog" rule.
2. **`TrailSummary` type is canonical in `packages/ui/src/types.ts`** (same shape as today's `pwa/src/lib/queries.ts` interface). `queries.ts` switches to a type re-export from ui so its existing consumers (home page, `queries.test.ts`) are untouched.
3. **Mutation ownership differs by component, following the spec's contracts verbatim:**
   - *TrailList* (spec: "receives precomputed trail summaries plus `onSelectTrail`, `onDeleteTrail`, and star-toggle callback"): the shared component fires callbacks; each app performs its own DB write. Rationale: the writes differ per platform (extension adds `trailDeleted` message + manual `refresh()`; PWA relies on liveQuery).
   - *TrailDetail* (spec: "mutation callbacks that the extension augments with its chrome messages"): the DB mutations are byte-identical in both apps today (`trailStore(db).update`, `visitStore(db).update/softDelete`, `splitTrail`, `mergeTrails`), so they stay inside the shared component — pushing them out would re-duplicate the exact logic this extraction exists to unify. The extension's chrome messages are post-write *augmentations*, delivered via `onChanged(kind)` / `onSplitDone` / `onMergeDone` hooks.
4. **Named behavior deltas** (all deliberate; listed for the manual pass):
   - PWA TrailList gains the active badge + date-range meta (spec-mandated unification).
   - Extension TrailList adopts PWA copy: sort labels ("Oldest"/"Starred" instead of "Oldest First"/"Starred First"), empty state "No trails yet." (drops "Browse Wikipedia to start!"), `type="search"` input, PWA item styling (cards instead of divider rows).
   - Extension starred sort gains the PWA's stable secondary sort (updatedAt desc).
   - Extension TrailDetail adopts the PWA per-trail sort-pref key scheme `trailDetail_sort_${trail.id}` (`{field, dir}`); the old global `trailDetailSort` localStorage entry is orphaned (ignored, not migrated — cosmetic preference).
   - Extension TrailDetail meta adopts the PWA short-month date format; PWA TrailDetail meta gains the date range + active badge (unification, extension already had both).
   - Extension detail view drops its `<hr class="timeline-start">` and negative-margin wrapper styling (PWA canon layout).
   - Extension merge candidates are loaded eagerly on detail mount (previously lazy on menu open) because `mergeCandidates` is now a prop. Trail counts are small; acceptable.
   - Extension name/note/star edits now trigger a container reload (fresher data than today's stale-prop behavior). The `trailMutated` chrome message still fires **only** on name save (today's exact behavior — note/star edits never sent it).
   - No back button in the shared component: the extension container renders its own (as today); the PWA never rendered one (its current `onBack` prop is accepted but unused — dropped).
5. **Sort prefs load once per component mount** (PWA's current `onMount` behavior) — navigating between two trail URLs in the PWA without unmounting keeps the previous trail's prefs in memory. Pre-existing PWA behavior, preserved as-is.
6. **No new unit tests.** `packages/ui` has no vitest harness (phase-1 precedent); the queriers feeding these components are already TDD-covered in `queries.test.ts`. Gates per task: `ui check`, app builds, app suites, structural greps. The hands-on cross-platform pass is Task 8 (operator).

## File Structure

**Create:**
- `packages/ui/src/types.ts` — canonical `TrailSummary` + `TrailChangeKind` types.
- `packages/ui/src/ConfirmDialog.svelte` — moved from PWA (canonical copy).
- `packages/ui/src/TrailList.svelte` — shared presentational list.
- `packages/ui/src/TrailDetail.svelte` — shared detail view.

**Modify:**
- `packages/ui/src/index.ts` — export the new components + types.
- `packages/pwa/src/lib/queries.ts` — `TrailSummary` becomes a re-export from ui.
- `packages/pwa/src/routes/trails/+page.svelte` — becomes the TrailList container (liveQuery + callbacks).
- `packages/pwa/src/routes/trails/[id]/+page.svelte` — becomes the TrailDetail container (liveQuery + title-wave header snippet).
- `packages/extension/src/history/TrailList.svelte` — becomes a thin container (keeps `export function refresh()` and `Props { onSelectTrail }` so `App.svelte` is untouched).
- `packages/extension/src/history/TrailDetail.svelte` — becomes a thin container (keeps `Props { trail, onBack, onMutated }`).

**Delete:**
- `packages/pwa/src/lib/components/TrailList.svelte` (Task 3)
- `packages/pwa/src/lib/components/TrailDetail.svelte`, `packages/pwa/src/lib/components/ConfirmDialog.svelte` (Task 6)
- `packages/extension/src/history/ConfirmDialog.svelte` (Task 7)

**Untouched on purpose:** `packages/extension/src/history/App.svelte` (its imports/bindings keep working against the containers), `packages/pwa/src/routes/+layout.svelte` (global `.delayed-spinner` style already available to route pages), `packages/ui/src/VisitCard.svelte`, `packages/ui/src/ImportDialog.svelte`.

---

### Task 1: Shared types + ConfirmDialog in packages/ui

**Files:**
- Create: `packages/ui/src/types.ts`
- Create: `packages/ui/src/ConfirmDialog.svelte`
- Modify: `packages/ui/src/index.ts`

**Interfaces:**
- Produces: `TrailSummary` (`{ trail: Trail; displayName: string; visitCount: number; lastDiscovered: string; searchText: string }`), `TrailChangeKind` (`"name" | "note" | "star" | "visitNote" | "visitDelete"`), `ConfirmDialog` component (`{ message, confirmLabel?, cancelLabel?, onConfirm, onCancel }`). Tasks 2–7 consume all three.

- [ ] **Step 1: Create the types module**

Create `packages/ui/src/types.ts`:

```ts
import type { Trail } from "@wikipedia-breadcrumbs/shared";

export interface TrailSummary {
  trail: Trail;
  displayName: string;
  visitCount: number;
  lastDiscovered: string; // timestamp of last visit, or trail.startedAt
  searchText: string;
}

/** Which field the shared TrailDetail just wrote, so platform containers can react. */
export type TrailChangeKind = "name" | "note" | "star" | "visitNote" | "visitDelete";
```

- [ ] **Step 2: Create the shared ConfirmDialog**

Create `packages/ui/src/ConfirmDialog.svelte` — byte-identical copy of `packages/pwa/src/lib/components/ConfirmDialog.svelte` (the canonical variant):

```svelte
<script lang="ts">
  interface Props {
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm: () => void;
    onCancel: () => void;
  }

  let { message, confirmLabel = "Confirm", cancelLabel = "Cancel", onConfirm, onCancel }: Props = $props();
</script>

<div class="overlay">
  <div class="dialog">
    <p>{message}</p>
    <div class="actions">
      <button class="btn-confirm" onclick={onConfirm}>{confirmLabel}</button>
      <button class="btn-cancel" onclick={onCancel}>{cancelLabel}</button>
    </div>
  </div>
</div>

<style>
  .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 200; }
  .dialog { background: white; border-radius: 12px; padding: 20px; max-width: 360px; width: 90%; }
  .dialog p { margin: 0 0 16px; font-size: 14px; color: #333; line-height: 1.4; }
  .actions { display: flex; gap: 8px; justify-content: flex-end; }
  .btn-confirm { padding: 8px 16px; background: #0066cc; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; }
  .btn-confirm:hover { background: #0055aa; }
  .btn-cancel { padding: 8px 16px; background: #eee; color: #333; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; }
  .btn-cancel:hover { background: #ddd; }
</style>
```

(Do NOT delete the app copies yet — the app TrailList/TrailDetail files still import them until Tasks 3–7.)

- [ ] **Step 3: Export from the index**

Replace `packages/ui/src/index.ts` with:

```ts
export { default as ImportDialog } from "./ImportDialog.svelte";
export { default as VisitCard } from "./VisitCard.svelte";
export { default as ConfirmDialog } from "./ConfirmDialog.svelte";
export type { TrailSummary, TrailChangeKind } from "./types.js";
```

- [ ] **Step 4: Type-check the package**

Run: `pnpm --filter @wikipedia-breadcrumbs/ui check`
Expected: 0 errors, 0 warnings.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/types.ts packages/ui/src/ConfirmDialog.svelte packages/ui/src/index.ts
git commit -m "feat(ui): add shared ConfirmDialog and TrailSummary/TrailChangeKind types"
```

---

### Task 2: Shared TrailList component

**Files:**
- Create: `packages/ui/src/TrailList.svelte`
- Modify: `packages/ui/src/index.ts`

**Interfaces:**
- Consumes: `TrailSummary` from `./types.js` (Task 1), `ConfirmDialog` (Task 1), `ImportDialog` (phase 1: props `{ db, getDeviceId, onComplete? }`, instance method `start()`).
- Produces: `TrailList` component with props `{ db: BreadcrumbsDB; getDeviceId: () => Promise<string>; summaries: TrailSummary[]; onSelectTrail: (s: TrailSummary) => void; onToggleStar: (s: TrailSummary) => void; onDeleteTrail: (s: TrailSummary) => void; onImported?: () => void }`. No data loading, no DB mutations except read-only export; delete confirmation happens inside (dialog names the trail), then fires `onDeleteTrail`.

- [ ] **Step 1: Create the component**

Create `packages/ui/src/TrailList.svelte`. Body is the PWA variant's script/template/styles with: data loading removed (summaries are a prop), star/delete mutations replaced by callbacks, the select handler replaced by the `onSelectTrail` callback, unified meta (date range + active badge — the spec-mandated truthful status display), and the `.active-badge` style added:

```svelte
<script lang="ts">
  import type { BreadcrumbsDB } from "@wikipedia-breadcrumbs/shared";
  import { exportTrailsJson, exportTrailsCsv, downloadFile, exportFilename } from "@wikipedia-breadcrumbs/shared";
  import ImportDialog from "./ImportDialog.svelte";
  import ConfirmDialog from "./ConfirmDialog.svelte";
  import type { TrailSummary } from "./types.js";

  interface Props {
    db: BreadcrumbsDB;
    getDeviceId: () => Promise<string>;
    summaries: TrailSummary[];
    onSelectTrail: (summary: TrailSummary) => void;
    onToggleStar: (summary: TrailSummary) => void;
    onDeleteTrail: (summary: TrailSummary) => void;
    onImported?: () => void;
  }

  let { db, getDeviceId, summaries, onSelectTrail, onToggleStar, onDeleteTrail, onImported }: Props = $props();

  type SortMode = "recent" | "oldest" | "starred";

  let search = $state("");
  let sortMode = $state<SortMode>("recent");
  let sortDropdownOpen = $state(false);

  const sortLabels: Record<SortMode, string> = { recent: "Most Recent", oldest: "Oldest", starred: "Starred" };

  $effect(() => {
    if (!sortDropdownOpen) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".sort-dropdown-wrap")) sortDropdownOpen = false;
    };
    setTimeout(() => document.addEventListener("click", close));
    return () => document.removeEventListener("click", close);
  });

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

  function toggleStar(summary: TrailSummary, e: Event) {
    e.stopPropagation();
    onToggleStar(summary);
  }

  let confirmState = $state<{ message: string; action: () => void } | null>(null);

  function deleteTrail(summary: TrailSummary, e: Event) {
    e.stopPropagation();
    confirmState = {
      message: `Delete "${summary.displayName}"?`,
      action: () => onDeleteTrail(summary),
    };
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric", month: "long", day: "numeric",
    });
  }

  // Data menu (import/export)
  let dataMenuOpen = $state(false);

  $effect(() => {
    if (!dataMenuOpen) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".data-menu-wrap")) dataMenuOpen = false;
    };
    setTimeout(() => document.addEventListener("click", close));
    return () => document.removeEventListener("click", close);
  });

  let importer: { start: () => Promise<void> } | undefined = $state();

  async function handleExport(format: "json" | "csv") {
    dataMenuOpen = false;
    const content = format === "json"
      ? await exportTrailsJson(db)
      : await exportTrailsCsv(db);
    downloadFile(content, exportFilename(null, format), format === "json" ? "application/json" : "text/csv");
  }
</script>

<div class="controls">
  <input
    class="search"
    type="search"
    placeholder="Search trails…"
    bind:value={search}
  />
  <div class="sort-dropdown-wrap">
    <button class="sort-dropdown-btn" onclick={() => { sortDropdownOpen = !sortDropdownOpen; }}>
      <span>{sortLabels[sortMode]}</span>
      <span class="sort-dropdown-arrow" aria-hidden="true">▾</span>
    </button>
    {#if sortDropdownOpen}
      <div class="sort-dropdown">
        {#each (["recent", "oldest", "starred"] as SortMode[]) as mode}
          <button class:selected={sortMode === mode} onclick={() => { sortMode = mode; sortDropdownOpen = false; }}>{sortLabels[mode]}</button>
        {/each}
      </div>
    {/if}
  </div>
  <div class="data-menu-wrap">
    <button class="data-menu-btn" onclick={() => { dataMenuOpen = !dataMenuOpen; }} title="Import / Export" aria-label="Import / Export">⋮</button>
    {#if dataMenuOpen}
      <div class="data-menu">
        <button onclick={() => { dataMenuOpen = false; importer?.start(); }}>Import</button>
        <button onclick={() => handleExport("json")}>Export JSON</button>
        <button onclick={() => handleExport("csv")}>Export CSV</button>
      </div>
    {/if}
  </div>
</div>

<ImportDialog bind:this={importer} {db} {getDeviceId} onComplete={onImported} />

{#if filtered.length === 0}
  <p class="empty">{search ? "No trails match your search." : "No trails yet."}</p>
{:else}
  <ul class="list">
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

        <button class="info" onclick={() => onSelectTrail(summary)}>
          <span class="name">{summary.displayName}</span>
          <span class="meta">
            {summary.visitCount} pages &middot; {formatDate(summary.trail.startedAt)}{#if formatDate(summary.trail.startedAt) !== formatDate(summary.lastDiscovered)}{" "}&mdash; {formatDate(summary.lastDiscovered)}{/if}
            {#if summary.trail.status === "active"}
              <span class="active-badge">Active</span>
            {/if}
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
  </ul>
{/if}

{#if confirmState}
  <ConfirmDialog
    message={confirmState.message}
    confirmLabel="Delete"
    onConfirm={() => { confirmState!.action(); confirmState = null; }}
    onCancel={() => { confirmState = null; }}
  />
{/if}

<style>
  .controls {
    display: flex;
    gap: 8px;
    margin-bottom: 14px;
    align-items: stretch;
  }
  .search {
    flex: 1;
    padding: 8px 10px;
    border: 1px solid #ddd;
    border-radius: 8px;
    font-size: 14px;
    outline: none;
    box-sizing: border-box;
  }
  .search:focus { border-color: #0066cc; }
  .sort-dropdown-wrap { position: relative; display: flex; }
  .sort-dropdown-btn {
    padding: 8px 10px; border: 1px solid #ddd; border-radius: 8px;
    font-size: 13px; background: white; cursor: pointer; box-sizing: border-box;
    display: flex; align-items: center; gap: 6px; white-space: nowrap; height: 100%;
  }
  .sort-dropdown-btn:hover { border-color: #bbb; }
  .sort-dropdown-arrow { color: #555; }
  .sort-dropdown {
    position: absolute; top: calc(100% + 4px); left: 0; background: white;
    border: 1px solid #ddd; border-radius: 8px; padding: 4px 0; z-index: 50;
    min-width: 140px; box-shadow: 0 4px 12px rgba(0,0,0,0.12);
  }
  .sort-dropdown button {
    display: block; width: 100%; text-align: left; padding: 8px 14px;
    border: none; background: none; cursor: pointer; font-size: 13px; color: #222;
  }
  .sort-dropdown button:hover { background: #f5f5f5; }
  .sort-dropdown button.selected { background: #e8f0fe; color: #0066cc; }

  .empty { color: #767676; font-size: 13px; }

  .list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
  .item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    background: #fafafa;
    border: 1px solid #ebebeb;
    border-radius: 8px;
    cursor: pointer;
  }
  .item:hover { background: #f0f0f0; }

  .star {
    background: none;
    border: none;
    font-size: 18px;
    cursor: pointer;
    padding: 0 2px;
    color: #ccc;
    flex-shrink: 0;
  }
  .star.starred { color: #f5a623; }

  .info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    overflow: hidden;
    background: none;
    border: none;
    font: inherit;
    color: inherit;
    cursor: pointer;
    padding: 0;
    text-align: left;
  }
  .name { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .meta { font-size: 11px; color: #888; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .active-badge { background: #d4edda; color: #155724; padding: 1px 6px; border-radius: 3px; font-size: 11px; }

  .delete {
    background: none;
    border: none;
    color: #bbb;
    cursor: pointer;
    font-size: 14px;
    padding: 2px 4px;
    flex-shrink: 0;
    margin-right: -8px;
  }
  .delete:hover { color: #cc3300; }

  .data-menu-wrap { position: relative; display: flex; }
  .data-menu-btn {
    background: none; border: 1px solid #ddd; border-radius: 8px;
    font-size: 18px; cursor: pointer; padding: 4px 10px;
    color: #999; line-height: 1; box-sizing: border-box; height: 100%;
  }
  .data-menu-btn:hover { color: #333; background: #f0f0f0; }
  .data-menu {
    position: absolute; top: calc(100% + 4px); right: 0; background: white;
    border: 1px solid #ddd; border-radius: 8px; padding: 4px 0; z-index: 50;
    min-width: 140px; box-shadow: 0 4px 12px rgba(0,0,0,0.12);
  }
  .data-menu button {
    display: block; width: 100%; text-align: left; padding: 8px 14px;
    border: none; background: none; cursor: pointer; font-size: 13px; color: #222;
  }
  .data-menu button:hover { background: #f5f5f5; }
</style>
```

Notes vs the PWA original: the `{#if loaded}` gate and `.fade-in` wrapper are removed (loading gates live in the containers); the unused `TrailStatus` import and the `trailStore`/`db-store` imports are gone (no DB mutations here); `getDeviceId` is a required prop (already async-typed).

- [ ] **Step 2: Export it**

In `packages/ui/src/index.ts`, add after the ConfirmDialog export:

```ts
export { default as TrailList } from "./TrailList.svelte";
```

- [ ] **Step 3: Type-check**

Run: `pnpm --filter @wikipedia-breadcrumbs/ui check`
Expected: 0 errors, 0 warnings.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/TrailList.svelte packages/ui/src/index.ts
git commit -m "feat(ui): add shared TrailList component"
```

---

### Task 3: PWA adopts shared TrailList

**Files:**
- Modify: `packages/pwa/src/routes/trails/+page.svelte`
- Modify: `packages/pwa/src/lib/queries.ts`
- Delete: `packages/pwa/src/lib/components/TrailList.svelte`

**Interfaces:**
- Consumes: `TrailList` + `TrailSummary` from `@wikipedia-breadcrumbs/ui` (Task 2), existing `useLiveQuery` / `queryTrailData` / `db` / `getDeviceId` (sync — wrapped async) from `$lib`.
- Produces: nothing new; the route page is now the container.

- [ ] **Step 1: Make ui's TrailSummary canonical in queries.ts**

In `packages/pwa/src/lib/queries.ts`, replace the local interface block:

```ts
export interface TrailSummary {
  trail: Trail;
  displayName: string;
  visitCount: number;
  lastDiscovered: string; // timestamp of last visit, or trail.startedAt
  searchText: string;
}
```

with a re-export (keep every other line of the file unchanged — `TrailData`, `TrailDetailData`, both queriers, and their consumers keep compiling against the identical shape):

```ts
import type { TrailSummary } from "@wikipedia-breadcrumbs/ui";
export type { TrailSummary } from "@wikipedia-breadcrumbs/ui";
```

(Place the `import type` with the other imports at the top of the file.)

- [ ] **Step 2: Rewrite the trails route page as the container**

Replace `packages/pwa/src/routes/trails/+page.svelte` with:

```svelte
<script lang="ts">
  import { goto } from "$app/navigation";
  import { trailStore } from "@wikipedia-breadcrumbs/shared";
  import { TrailList, type TrailSummary } from "@wikipedia-breadcrumbs/ui";
  import { db } from "$lib/stores/db";
  import { getDeviceId } from "$lib/stores/device-id";
  import { useLiveQuery } from "$lib/live-query.svelte";
  import { queryTrailData, type TrailData } from "$lib/queries";
  import { syncState } from "$lib/stores/sync.svelte";
  import { runTitleWave, makeLetterColors } from "$lib/utils/title-wave";

  const titleText = "Trails";
  const titleLetters = titleText.split("");
  let letterColors = $state(makeLetterColors(titleText));

  let _prevSyncing = false;
  $effect(() => {
    if (syncState.syncing && !_prevSyncing) {
      runTitleWave(letterColors, (c) => { letterColors = c; });
    }
    _prevSyncing = syncState.syncing;
  });

  const ts = trailStore(db);

  const data = useLiveQuery(() => queryTrailData(db), null as TrailData | null);
  const loaded = $derived(data.current !== null);
  const summaries = $derived(data.current?.summaries ?? []);

  async function handleToggleStar(s: TrailSummary) {
    await ts.update(s.trail.id, { isStarred: !s.trail.isStarred });
  }

  async function handleDeleteTrail(s: TrailSummary) {
    await ts.softDelete(s.trail.id);
  }
</script>

<h1 aria-label="Trails"><span aria-hidden="true">{#each titleLetters as letter, i}<span style="color: {letterColors[i]}">{letter}</span>{/each}</span></h1>

{#if loaded}
  <div class="fade-in">
    <TrailList
      {db}
      getDeviceId={async () => getDeviceId()}
      {summaries}
      onSelectTrail={(s) => goto("/trails/" + s.trail.id)}
      onToggleStar={handleToggleStar}
      onDeleteTrail={handleDeleteTrail}
    />
  </div>
{/if}

<style>
  h1 { font-size: 22px; font-weight: 700; margin: 0 0 20px; }
  .fade-in { animation: fadeIn 0.1s ease-in; }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
</style>
```

(No `onImported` — liveQuery re-runs on the import's writes, exactly like today. The title-wave block is moved verbatim from the old page.)

- [ ] **Step 3: Delete the old component**

```bash
git rm packages/pwa/src/lib/components/TrailList.svelte
```

(`$lib/components/ConfirmDialog.svelte` stays — the PWA TrailDetail still uses it until Task 6.)

- [ ] **Step 4: Verify**

Run: `pnpm --filter @wikipedia-breadcrumbs/pwa test`
Expected: 10/10 pass.
Run: `pnpm --filter @wikipedia-breadcrumbs/pwa build`
Expected: build succeeds.
Run: `grep -rn "components/TrailList" packages/pwa/src`
Expected: no matches.

- [ ] **Step 5: Commit**

```bash
git add -A packages/pwa/
git commit -m "refactor(pwa): adopt shared TrailList; trails route becomes the container"
```

---

### Task 4: Extension adopts shared TrailList

**Files:**
- Modify: `packages/extension/src/history/TrailList.svelte` (full rewrite as thin container)

**Interfaces:**
- Consumes: `TrailList` + `TrailSummary` from ui (Task 2); extension `getDeviceId` (already async) from `../shared/device-id.js`.
- Produces: same external contract as today so `App.svelte` needs no change — `Props { onSelectTrail: (trail: Trail) => void }` and instance method `refresh(): Promise<void>` (used via `bind:this`).

- [ ] **Step 1: Rewrite the container**

Replace `packages/extension/src/history/TrailList.svelte` with:

```svelte
<script lang="ts">
  import type { Trail, Visit } from "@wikipedia-breadcrumbs/shared";
  import { BreadcrumbsDB, trailStore, visitStore } from "@wikipedia-breadcrumbs/shared";
  import { getDeviceId } from "../shared/device-id.js";
  import { TrailList, type TrailSummary } from "@wikipedia-breadcrumbs/ui";

  interface Props {
    onSelectTrail: (trail: Trail) => void;
  }

  let { onSelectTrail }: Props = $props();

  const db = new BreadcrumbsDB();
  const trailOps = trailStore(db);
  const visitOps = visitStore(db);

  let summaries: TrailSummary[] = $state([]);
  let loading = $state(true);

  function displayNameFor(trail: Trail, visits: Visit[]): string {
    if (trail.name) return trail.name;
    if (visits.length === 0) return "Empty trail";
    if (visits.length === 1) return visits[0].title;
    return `${visits[0].title} → ${visits[visits.length - 1].title}`;
  }

  export async function refresh() {
    loading = true;
    const allTrails = await trailOps.getAll();
    const next: TrailSummary[] = [];
    for (const trail of allTrails) {
      const visits = await visitOps.getByTrailId(trail.id);
      const searchParts = [trail.name ?? "", trail.note ?? ""];
      for (const v of visits) {
        searchParts.push(v.title, v.note ?? "");
      }
      next.push({
        trail,
        displayName: displayNameFor(trail, visits),
        visitCount: visits.length,
        lastDiscovered: visits[visits.length - 1]?.timestamp ?? trail.startedAt,
        searchText: searchParts.join(" ").toLowerCase(),
      });
    }
    summaries = next;
    loading = false;
  }

  async function handleToggleStar(s: TrailSummary) {
    await trailOps.update(s.trail.id, { isStarred: !s.trail.isStarred });
    await refresh();
  }

  async function handleDeleteTrail(s: TrailSummary) {
    await trailOps.softDelete(s.trail.id);
    chrome.runtime.sendMessage({ type: "trailDeleted", trailId: s.trail.id });
    await refresh();
  }

  refresh();
</script>

{#if loading}
  <div class="delayed-spinner"></div>
{:else}
  <TrailList
    {db}
    {getDeviceId}
    {summaries}
    onSelectTrail={(s) => onSelectTrail(s.trail)}
    onToggleStar={handleToggleStar}
    onDeleteTrail={handleDeleteTrail}
    onImported={() => refresh()}
  />
{/if}
```

Notes: the summary computation is today's `refresh()` with the `TrailSummary` fields renamed to the canonical shape (`firstTitle`/`lastTitle` fold into `displayName`; `lastDiscoveredAt` → `lastDiscovered`). Export/import UI, search, sort, confirm-delete all now come from the shared component. The extension's ConfirmDialog import disappears from this file (its TrailDetail still uses it until Task 7).

- [ ] **Step 2: Verify**

Run: `pnpm --filter @wikipedia-breadcrumbs/extension test`
Expected: 45/45 pass.
Run: `pnpm --filter @wikipedia-breadcrumbs/extension build`
Expected: build succeeds.
Run: `grep -n "ConfirmDialog\|ImportDialog\|sort-dropdown" packages/extension/src/history/TrailList.svelte`
Expected: no matches (the container renders none of that UI itself).

- [ ] **Step 3: Commit**

```bash
git add packages/extension/src/history/TrailList.svelte
git commit -m "refactor(extension): adopt shared TrailList; history TrailList becomes a thin container"
```

---

### Task 5: Shared TrailDetail component

**Files:**
- Create: `packages/ui/src/TrailDetail.svelte`
- Modify: `packages/ui/src/index.ts`

**Interfaces:**
- Consumes: `VisitCard` (phase 1: props `{ visit, onUpdateNote, onDelete, onSplit?, onNavigate?, showLanguageBadge? }`), `ConfirmDialog` (Task 1), `TrailChangeKind` (Task 1); from shared: `trailStore`, `visitStore`, `splitTrail(db, trailId, atPosition): Promise<[originalId, newId]>`, `mergeTrails`, `exportTrailsJson/Csv`, `downloadFile`, `exportFilename`, `getLanguageBadgeSettings`, `shouldShowLanguageBadge`.
- Produces: `TrailDetail` component with props:
  - `db: BreadcrumbsDB`
  - `trail: Trail` (non-null; containers gate loading)
  - `visits: Visit[]` (position order)
  - `mergeCandidates: Array<{ id: string; displayName: string }>`
  - `onNavigate?: (visit: Visit, e: MouseEvent) => void` (passed through to every VisitCard)
  - `onChanged?: (kind: TrailChangeKind) => void` — fired after each completed DB write (name save, note save, star toggle, visit note update, visit delete). NOT fired by the keystroke-level `autoSave*` handlers (the extension container would send chrome messages / reload too often).
  - `onSplitDone?: (originalId: string, newTrailId: string) => void`
  - `onMergeDone?: (mergedTrailId: string) => void`
  - `header?: Snippet<[string]>` — optional custom rendering of the display name inside the name-edit trigger (receives the display name); default is plain text.

- [ ] **Step 1: Create the component**

Create `packages/ui/src/TrailDetail.svelte`. Body is the PWA variant with: data via props instead of liveQuery, `trailId` → `trail.id`, title-wave/syncState replaced by the `header` snippet, mutation hooks added, and the unified meta (date range + active badge). Since `trail` is a required non-null prop, the PWA's `if (!trail)` guards and `{#if !trail}` gate are dropped:

```svelte
<script lang="ts">
  import { onMount } from "svelte";
  import type { Snippet } from "svelte";
  import { trailStore, visitStore, splitTrail, mergeTrails, exportTrailsJson, exportTrailsCsv, downloadFile, exportFilename, getLanguageBadgeSettings, shouldShowLanguageBadge } from "@wikipedia-breadcrumbs/shared";
  import type { BreadcrumbsDB, Trail, Visit, LanguageBadgeSettings } from "@wikipedia-breadcrumbs/shared";
  import VisitCard from "./VisitCard.svelte";
  import ConfirmDialog from "./ConfirmDialog.svelte";
  import type { TrailChangeKind } from "./types.js";

  interface Props {
    db: BreadcrumbsDB;
    trail: Trail;
    visits: Visit[];
    mergeCandidates: Array<{ id: string; displayName: string }>;
    onNavigate?: (visit: Visit, e: MouseEvent) => void;
    onChanged?: (kind: TrailChangeKind) => void;
    onSplitDone?: (originalId: string, newTrailId: string) => void;
    onMergeDone?: (mergedTrailId: string) => void;
    header?: Snippet<[string]>;
  }

  let { db, trail, visits, mergeCandidates, onNavigate, onChanged, onSplitDone, onMergeDone, header }: Props = $props();

  const ts = trailStore(db);
  const vs = visitStore(db);

  const trailDisplayNames = $derived(
    Object.fromEntries(mergeCandidates.map((c) => [c.id, c.displayName]))
  );

  // Editable fields
  let editingName = $state(false);
  let nameValue = $state("");
  let editingNote = $state(false);
  let noteValue = $state("");

  // Stamp dismiss on mousedown while editing, so focus toggle is suppressed
  $effect(() => {
    if (!editingName && !editingNote) return;
    const stamp = () => { (window as any).__dismissTime = Date.now(); };
    document.addEventListener("mousedown", stamp, true);
    return () => document.removeEventListener("mousedown", stamp, true);
  });

  // Sort state (persisted to localStorage, per-trail key)
  type SortField = "discovery" | "visited";
  type SortDir = "asc" | "desc";

  const SORT_KEY = $derived(`trailDetail_sort_${trail.id}`);

  function loadSortPrefs(): { field: SortField; dir: SortDir } {
    try {
      const stored = localStorage.getItem(SORT_KEY);
      if (stored) return JSON.parse(stored);
    } catch {}
    return { field: "discovery", dir: "asc" };
  }

  let sortField = $state<SortField>("discovery");
  let sortDir = $state<SortDir>("asc");

  // Focused view
  let focusedVisitId: string | null = $state(null);

  // Merge UI
  let showMerge = $state(false);
  let mergeTargetId = $state("");
  let mergeTargetLabel = $state("Select a trail…");
  let mergeDropdownOpen = $state(false);

  $effect(() => {
    if (!mergeDropdownOpen) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".merge-dropdown-wrap")) mergeDropdownOpen = false;
    };
    setTimeout(() => document.addEventListener("click", close));
    return () => document.removeEventListener("click", close);
  });

  // Detail menu (merge/export)
  let detailMenuOpen = $state(false);
  let langSettings: LanguageBadgeSettings | null = $state(null);

  $effect(() => {
    if (!detailMenuOpen) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".detail-menu-wrap")) detailMenuOpen = false;
    };
    setTimeout(() => document.addEventListener("click", close));
    return () => document.removeEventListener("click", close);
  });

  onMount(() => {
    const prefs = loadSortPrefs();
    sortField = prefs.field;
    sortDir = prefs.dir;
    getLanguageBadgeSettings(db).then((s) => { langSettings = s; });
  });

  function saveSortPrefs() {
    localStorage.setItem(SORT_KEY, JSON.stringify({ field: sortField, dir: sortDir }));
  }

  function setSortField(f: SortField) {
    if (sortField === f) {
      sortDir = sortDir === "asc" ? "desc" : "asc";
    } else {
      sortField = f;
      sortDir = "asc";
    }
    saveSortPrefs();
  }

  const sortedVisits = $derived.by(() => {
    const list = [...visits];
    list.sort((a, b) => {
      const aVal = sortField === "discovery" ? a.timestamp : a.lastVisitedAt;
      const bVal = sortField === "discovery" ? b.timestamp : b.lastVisitedAt;
      return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });
    return list;
  });

  const focusedView = $derived.by(() => {
    if (!focusedVisitId || sortField !== "discovery") return null;
    const focused = visits.find((v) => v.id === focusedVisitId);
    if (!focused) return null;
    const parent = focused.parentVisitId
      ? visits.find((v) => v.id === focused.parentVisitId) ?? null
      : null;
    const children = visits.filter((v) => v.parentVisitId === focused.id);
    return { focused, parent, children };
  });

  function toggleFocus(visitId: string) {
    if ((window as any).__dismissTime && Date.now() - (window as any).__dismissTime < 300) return;
    focusedVisitId = focusedVisitId === visitId ? null : visitId;
  }

  const sortHint = $derived(
    focusedView ? "focused view" : sortDir === "asc" ? "oldest to newest" : "newest to oldest"
  );

  const trailDisplayName = $derived.by(() => {
    if (trail.name) return trail.name;
    if (visits.length === 0) return "Empty trail";
    if (visits.length === 1) return visits[0].title;
    return `${visits[0].title} → ${visits[visits.length - 1].title}`;
  });

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric", month: "short", day: "numeric",
    });
  }

  async function saveName() {
    const v = nameValue.trim() || null;
    await ts.update(trail.id, { name: v });
    editingName = false;
    (window as any).__dismissTime = Date.now();
    onChanged?.("name");
  }

  async function autoSaveName() {
    await ts.update(trail.id, { name: nameValue.trim() || null });
  }

  async function saveNote() {
    const v = noteValue.trim() || null;
    await ts.update(trail.id, { note: v });
    editingNote = false;
    (window as any).__dismissTime = Date.now();
    onChanged?.("note");
  }

  async function autoSaveNote() {
    await ts.update(trail.id, { note: noteValue.trim() || null });
  }

  async function toggleStar() {
    await ts.update(trail.id, { isStarred: !trail.isStarred });
    onChanged?.("star");
  }

  async function handleUpdateNote(visitId: string, note: string | null) {
    await vs.update(visitId, { note });
    onChanged?.("visitNote");
  }

  let confirmState = $state<{ message: string; confirmLabel: string; action: () => void } | null>(null);

  async function handleDeleteVisit(visitId: string) {
    confirmState = {
      message: "Delete this visit?",
      confirmLabel: "Delete",
      action: async () => {
        await vs.softDelete(visitId);
        onChanged?.("visitDelete");
      },
    };
  }

  async function handleSplit(position: number) {
    confirmState = {
      message: "Split trail here? Visits after this point will become a new trail.",
      confirmLabel: "Split",
      action: async () => {
        const [originalId, newTrailId] = await splitTrail(db, trail.id, position);
        onSplitDone?.(originalId, newTrailId);
      },
    };
  }

  async function handleMerge() {
    if (!mergeTargetId) return;
    const label = trailDisplayNames[mergeTargetId] ?? "this trail";
    confirmState = {
      message: `Merge "${label}" into this trail? The other trail will be deleted.`,
      confirmLabel: "Merge",
      action: async () => {
        const merged = mergeTargetId;
        await mergeTrails(db, trail.id, merged);
        showMerge = false;
        mergeTargetId = "";
        mergeTargetLabel = "Select a trail…";
        onMergeDone?.(merged);
      },
    };
  }

  async function handleDetailExport(format: "json" | "csv") {
    detailMenuOpen = false;
    const content = format === "json"
      ? await exportTrailsJson(db, [trail.id])
      : await exportTrailsCsv(db, [trail.id]);
    downloadFile(content, exportFilename(trail.name ?? null, format), format === "json" ? "application/json" : "text/csv");
  }

  // Only show split button in discovery-asc view (positional order)
  const showSplit = $derived(sortField === "discovery" && sortDir === "asc");
</script>

<div class="header-box">
  <button class="star" class:starred={trail.isStarred} onclick={toggleStar}
    title={trail.isStarred ? "Unstar" : "Star"}
    aria-label={trail.isStarred ? "Unstar" : "Star"}
  >
    {trail.isStarred ? "★" : "☆"}
  </button>
  <div class="header-content">
    <div class="title-row">
      {#if editingName}
        <!-- svelte-ignore a11y_autofocus -->
        <input
          class="name-input"
          type="text"
          bind:value={nameValue}
          placeholder="Trail name"
          onkeydown={(e) => { if (e.key === "Enter") saveName(); }}
          onblur={saveName}
          oninput={autoSaveName}
          autofocus
        />
      {:else}
        <h1 class="trail-name">
          <button class="name-edit-trigger"
            onclick={() => { editingName = true; nameValue = trail.name ?? ""; }}
            title="Click to edit name"
          >
            {#if header}{@render header(trailDisplayName)}{:else}{trailDisplayName}{/if}
          </button>
        </h1>
        <div class="detail-menu-wrap">
          <button class="detail-menu-btn" onclick={() => { detailMenuOpen = !detailMenuOpen; }} title="Actions" aria-label="Actions">⋮</button>
          {#if detailMenuOpen}
            <div class="detail-menu">
              <button onclick={() => { detailMenuOpen = false; showMerge = !showMerge; }}>Merge</button>
              <button onclick={() => handleDetailExport("json")}>Export JSON</button>
              <button onclick={() => handleDetailExport("csv")}>Export CSV</button>
            </div>
          {/if}
        </div>
      {/if}
    </div>
    <div class="meta">
      <span>{visits.length} page{visits.length === 1 ? "" : "s"}</span>
      <span>·</span>
      <span>Started {formatDate(trail.startedAt)}{#if visits.length > 0 && formatDate(trail.startedAt) !== formatDate(visits[visits.length - 1].timestamp)}{" "}&mdash; {formatDate(visits[visits.length - 1].timestamp)}{/if}</span>
      {#if trail.status === "active"}<span class="active-badge">Active</span>{/if}
    </div>
    <div class="trail-note-section">
      {#if trail.note && !editingNote}
        <div class="trail-note" role="button" tabindex="0"
          onclick={() => { editingNote = true; noteValue = trail.note ?? ""; }}
          onkeydown={(e) => e.key === "Enter" && (editingNote = true)}
          title="Click to edit"
        >
          {trail.note}
        </div>
      {:else if editingNote}
        <!-- svelte-ignore a11y_autofocus -->
        <textarea
          class="trail-note-input"
          rows="3"
          bind:value={noteValue}
          placeholder="Add a note about this trail…"
          onblur={saveNote}
          oninput={autoSaveNote}
          autofocus
        ></textarea>
      {:else}
        <button class="add-note" onclick={() => { editingNote = true; noteValue = ""; }}>+ Add trail note</button>
      {/if}
    </div>
  </div>
</div>

{#if showMerge}
  <div class="merge-picker">
    <div class="merge-dropdown-wrap">
      <button class="merge-dropdown-btn" onclick={() => { mergeDropdownOpen = !mergeDropdownOpen; }}>
        <span class="merge-dropdown-label">{mergeTargetLabel}</span>
        <span class="merge-dropdown-arrow" aria-hidden="true">▾</span>
      </button>
      {#if mergeDropdownOpen}
        <div class="merge-dropdown">
          {#each mergeCandidates as t}
            <button class:selected={mergeTargetId === t.id} onclick={() => {
              mergeTargetId = t.id;
              mergeTargetLabel = trailDisplayNames[t.id] ?? "…";
              mergeDropdownOpen = false;
            }}>{trailDisplayNames[t.id] ?? "…"}</button>
          {/each}
        </div>
      {/if}
    </div>
    <button class="btn-save" onclick={handleMerge} disabled={!mergeTargetId}>Merge</button>
    <button class="btn-cancel" onclick={() => { showMerge = false; mergeTargetId = ""; mergeTargetLabel = "Select a trail…"; }}>Cancel</button>
  </div>
{/if}

<!-- Sort bar -->
<div class="sort-bar">
  <div class="sort-buttons">
    <button
      class="sort-btn"
      class:active={sortField === "discovery"}
      onclick={() => {
        if (focusedView) { focusedVisitId = null; }
        else { setSortField("discovery"); }
      }}
    >
      Discovery {focusedView ? "◎" : sortField === "discovery" ? (sortDir === "asc" ? "↑" : "↓") : ""}
    </button>
    <button
      class="sort-btn"
      class:active={sortField === "visited"}
      onclick={() => setSortField("visited")}
    >
      Visited {sortField === "visited" ? (sortDir === "asc" ? "↑" : "↓") : ""}
    </button>
    <span class="sort-hint">{sortHint}</span>
  </div>
</div>

<!-- Visit list -->
<div class="visits">
  {#if sortedVisits.length === 0}
    <p class="empty">No visits in this trail.</p>
  {:else if focusedView}
    {#if focusedView.parent}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="focused-grandparent" onclick={(e) => {
        if ((e.target as HTMLElement).closest("a, button, input, textarea, .note, .card-menu-wrap, .cite-wrap, .note-edit")) return;
        toggleFocus(focusedView.parent!.id);
      }}>
        <VisitCard
          visit={focusedView.parent}
          onUpdateNote={handleUpdateNote}
          onDelete={handleDeleteVisit}
          onNavigate={onNavigate}
          showLanguageBadge={langSettings ? shouldShowLanguageBadge(focusedView.parent.language, langSettings) : false}
        />
      </div>
    {/if}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="focused-current" onclick={(e) => {
      if ((e.target as HTMLElement).closest("a, button, input, textarea, .note, .card-menu-wrap, .cite-wrap, .note-edit")) return;
      toggleFocus(focusedView.focused.id);
    }}>
      <VisitCard
        visit={focusedView.focused}
        onUpdateNote={handleUpdateNote}
        onDelete={handleDeleteVisit}
        onNavigate={onNavigate}
        showLanguageBadge={langSettings ? shouldShowLanguageBadge(focusedView.focused.language, langSettings) : false}
      />
    </div>
    {#if focusedView.children.length > 0}
      {#each focusedView.children as child}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="focused-child" onclick={(e) => {
          if ((e.target as HTMLElement).closest("a, button, input, textarea, .note, .card-menu-wrap, .cite-wrap, .note-edit")) return;
          toggleFocus(child.id);
        }}>
          <VisitCard
            visit={child}
            onUpdateNote={handleUpdateNote}
            onDelete={handleDeleteVisit}
            onNavigate={onNavigate}
            showLanguageBadge={langSettings ? shouldShowLanguageBadge(child.language, langSettings) : false}
          />
        </div>
      {/each}
    {:else}
      <p class="no-children">No pages were discovered from this page.</p>
    {/if}
  {:else}
    {#each sortedVisits as visit, i (visit.id)}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="visit-wrapper" class:focusable={sortField === "discovery"} onclick={(e) => {
        if ((e.target as HTMLElement).closest("a, button, input, textarea, .note, .card-menu-wrap, .cite-wrap, .note-edit")) return;
        if (sortField === "discovery") toggleFocus(visit.id);
      }}>
        <VisitCard
          {visit}
          onUpdateNote={handleUpdateNote}
          onDelete={handleDeleteVisit}
          onSplit={showSplit && i < sortedVisits.length - 1 ? handleSplit : undefined}
          onNavigate={onNavigate}
          showLanguageBadge={langSettings ? shouldShowLanguageBadge(visit.language, langSettings) : false}
        />
      </div>
    {/each}
  {/if}
</div>

{#if confirmState}
  <ConfirmDialog
    message={confirmState.message}
    confirmLabel={confirmState.confirmLabel}
    onConfirm={() => { confirmState!.action(); confirmState = null; }}
    onCancel={() => { confirmState = null; }}
  />
{/if}

<style>
  .header-box {
    display: flex; gap: 10px; padding: 12px; border: 1px solid #e8e8e8;
    border-radius: 10px; margin-bottom: 14px; align-items: start; position: relative;
  }
  .header-content { flex: 1; min-width: 0; padding-right: 20px; }
  .title-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .trail-name {
    font-size: 20px;
    font-weight: 700;
    margin: 0;
    flex: 1;
    word-break: break-word;
    line-height: 1.3;
  }
  .name-edit-trigger {
    background: none;
    border: none;
    font: inherit;
    color: inherit;
    cursor: pointer;
    padding: 0;
    text-align: left;
  }
  .name-edit-trigger:hover { text-decoration: underline; }

  .name-input {
    flex: 1;
    font-size: 20px;
    font-weight: 700;
    padding: 0;
    border: none;
    box-shadow: 0 2px 0 #0066cc;
    border-radius: 0;
    outline: none;
    line-height: 1.3;
  }

  .star {
    background: none;
    border: none;
    font-size: 20px;
    cursor: pointer;
    color: #ccc;
    padding: 0;
    flex-shrink: 0;
  }
  .star.starred { color: #f5a623; }

  .detail-menu-wrap { position: absolute; top: 8px; right: 8px; }
  .detail-menu-btn {
    background: none; border: none;
    font-size: 16px; cursor: pointer; padding: 0 4px; color: #999; line-height: 1;
  }
  .detail-menu-btn:hover { color: #333; }
  .detail-menu {
    position: absolute; top: calc(100% + 4px); right: 0; background: white;
    border: 1px solid #ddd; border-radius: 8px; padding: 4px 0; z-index: 50;
    min-width: 140px; box-shadow: 0 4px 12px rgba(0,0,0,0.12);
  }
  .detail-menu button {
    display: block; width: 100%; text-align: left; padding: 8px 14px;
    border: none; background: none; cursor: pointer; font-size: 13px; color: #222;
  }
  .detail-menu button:hover { background: #f5f5f5; }

  .merge-picker {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
    margin-bottom: 10px;
    padding: 10px;
    background: #f8f8f8;
    border-radius: 8px;
    border: 1px solid #e0e0e0;
  }
  .merge-dropdown-wrap { position: relative; flex: 1; min-width: 0; }
  .merge-dropdown-btn {
    width: 100%; padding: 6px 8px; border: 1px solid #ddd; border-radius: 6px;
    background: white; cursor: pointer; font-size: 13px; text-align: left;
    display: flex; justify-content: space-between; align-items: center;
  }
  .merge-dropdown-btn:hover { border-color: #bbb; }
  .merge-dropdown-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .merge-dropdown-arrow { color: #555; flex-shrink: 0; margin-left: 8px; }
  .merge-dropdown {
    position: absolute; top: calc(100% + 4px); left: 0; right: 0; background: white;
    border: 1px solid #ddd; border-radius: 8px; padding: 4px 0; z-index: 50;
    max-height: 200px; overflow-y: auto; box-shadow: 0 4px 12px rgba(0,0,0,0.12);
  }
  .merge-dropdown button {
    display: block; width: 100%; text-align: left; padding: 8px 12px;
    border: none; background: none; cursor: pointer; font-size: 13px; color: #222;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .merge-dropdown button:hover { background: #f5f5f5; }
  .merge-dropdown button.selected { background: #e8f0fe; color: #0066cc; }

  .btn-save {
    font-size: 12px; padding: 4px 10px; background: #0066cc; color: white;
    border: none; border-radius: 6px; cursor: pointer;
  }
  .btn-save:disabled { opacity: 0.5; cursor: default; }
  .btn-cancel {
    font-size: 12px; padding: 4px 10px; background: #eee; color: #333;
    border: none; border-radius: 6px; cursor: pointer;
  }

  .meta {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: #666;
    flex-wrap: wrap;
    margin-top: 4px;
  }
  .active-badge { background: #d4edda; color: #155724; padding: 1px 6px; border-radius: 3px; font-size: 11px; }

  .trail-note-section { margin-top: 8px; }
  .trail-note {
    font-size: 13px; color: #333; background: #f8f8f8;
    border-radius: 6px; padding: 8px 10px; cursor: pointer;
    white-space: pre-wrap; word-break: break-word;
  }
  .trail-note:hover { background: #f0f0f0; }
  .trail-note-input {
    width: 100%; box-sizing: border-box; padding: 8px 10px;
    border: 1px solid #ddd; border-radius: 6px;
    font-size: 16px; font-family: inherit; resize: vertical;
  }
  .add-note {
    background: none; border: none; color: #0066cc;
    cursor: pointer; font-size: 13px; padding: 0;
  }
  .add-note:hover { text-decoration: underline; }

  .sort-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
    gap: 8px;
  }
  .sort-buttons { display: flex; gap: 4px; align-items: center; }
  .sort-btn {
    font-size: 12px; padding: 5px 12px;
    border: 1px solid #ddd; border-radius: 6px;
    background: #f8f8f8; cursor: pointer; color: #555;
    min-width: 90px; height: 28px;
  }
  .sort-btn.active { background: #e8f0fe; color: #0066cc; border-color: #aac4f5; }
  .sort-hint { font-size: 11px; color: #aaa; }

  .visits { display: flex; flex-direction: column; gap: 8px; }
  .empty { color: #767676; font-size: 13px; }

  .visit-wrapper.focusable { cursor: pointer; border-radius: 10px; }
  .visit-wrapper.focusable:hover { background: #fafafa; }
  .focused-grandparent { opacity: 0.6; cursor: pointer; }
  .focused-grandparent:hover { opacity: 0.8; }
  .focused-current { cursor: pointer; }
  .focused-current > :global(.card) { background: #f0f7ff; }
  .focused-current:hover > :global(.card) { background: #e4effa; }
  .focused-child { margin-left: 16px; border-left: 2px solid #0066cc; padding-left: 12px; cursor: pointer; }
  .focused-child:hover { background: #fafafa; border-radius: 0 10px 10px 0; }
  .no-children { color: #999; font-size: 13px; margin: 4px 0 0 16px; }
</style>
```

Notes vs the PWA original: `onNavigate` is now passed to all four VisitCard usages (the PWA passes `undefined`, preserving plain-link behavior); the meta line gains the date range + active badge; the `.sr-only` style moved out (it belongs to the PWA's header snippet, defined in the PWA page); `ConfirmDialog`/`VisitCard` are relative imports.

- [ ] **Step 2: Export it**

In `packages/ui/src/index.ts`, add after the TrailList export:

```ts
export { default as TrailDetail } from "./TrailDetail.svelte";
```

- [ ] **Step 3: Type-check**

Run: `pnpm --filter @wikipedia-breadcrumbs/ui check`
Expected: 0 errors, 0 warnings.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/TrailDetail.svelte packages/ui/src/index.ts
git commit -m "feat(ui): add shared TrailDetail component"
```

---

### Task 6: PWA adopts shared TrailDetail

**Files:**
- Modify: `packages/pwa/src/routes/trails/[id]/+page.svelte`
- Delete: `packages/pwa/src/lib/components/TrailDetail.svelte`
- Delete: `packages/pwa/src/lib/components/ConfirmDialog.svelte`

**Interfaces:**
- Consumes: `TrailDetail` from ui (Task 5); existing `useLiveQuery` / `queryTrailDetail` / `db` / `syncState` / title-wave utils / `markTrailViewed` from `$lib`.
- Produces: nothing new; the route page is now the container. No `onChanged`/`onSplitDone`/`onMergeDone` are passed — liveQuery re-runs on every Dexie write, exactly replacing today's reactivity.

- [ ] **Step 1: Rewrite the detail route page as the container**

Replace `packages/pwa/src/routes/trails/[id]/+page.svelte` with:

```svelte
<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { TrailDetail } from "@wikipedia-breadcrumbs/ui";
  import { db } from "$lib/stores/db";
  import { syncState } from "$lib/stores/sync.svelte";
  import { runTitleWave, makeLetterColors } from "$lib/utils/title-wave";
  import { useLiveQuery } from "$lib/live-query.svelte";
  import { queryTrailDetail, type TrailDetailData } from "$lib/queries";
  import { markTrailViewed } from "$lib/stores/install.svelte";

  onMount(() => {
    markTrailViewed();
  });

  const detail = useLiveQuery(
    () => queryTrailDetail(db, $page.params.id),
    null as TrailDetailData | null,
    () => $page.params.id
  );
  const trail = $derived(detail.current?.trail ?? null);
  const visits = $derived(detail.current?.visits ?? []);
  const mergeCandidates = $derived(detail.current?.mergeCandidates ?? []);

  const trailDisplayName = $derived.by(() => {
    if (!trail) return "";
    if (trail.name) return trail.name;
    if (visits.length === 0) return "Empty trail";
    if (visits.length === 1) return visits[0].title;
    return `${visits[0].title} → ${visits[visits.length - 1].title}`;
  });

  let trailNameColors = $state<string[]>([]);
  $effect(() => {
    trailNameColors = makeLetterColors(trailDisplayName);
  });

  let _prevSyncing = false;
  $effect(() => {
    if (syncState.syncing && !_prevSyncing && trailNameColors.length > 0) {
      runTitleWave(trailNameColors, (c) => { trailNameColors = c; });
    }
    _prevSyncing = syncState.syncing;
  });
</script>

{#snippet header(name: string)}
  <span aria-hidden="true">{#each name.split("") as letter, i}<span style="color: {trailNameColors[i] ?? '#000000'}">{letter}</span>{/each}</span><span class="sr-only">{name}</span>
{/snippet}

{#if !trail}
  <div class="delayed-spinner"></div>
{:else}
  <TrailDetail {db} {trail} {visits} {mergeCandidates} {header} />
{/if}

<style>
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
</style>
```

Notes: `.delayed-spinner` is a global style from `+layout.svelte` — available here. The former `onBack` prop was accepted-but-unused by the old component (the PWA has no back button); it is dropped, so the `goto` import goes too. The title-wave block moves here from the old component, driving the letters through the `header` snippet.

- [ ] **Step 2: Delete the old components**

```bash
git rm packages/pwa/src/lib/components/TrailDetail.svelte packages/pwa/src/lib/components/ConfirmDialog.svelte
```

(ConfirmDialog's last PWA consumer was the old TrailDetail — TrailList's went in Task 3.)

- [ ] **Step 3: Verify**

Run: `pnpm --filter @wikipedia-breadcrumbs/pwa test`
Expected: 10/10 pass.
Run: `pnpm --filter @wikipedia-breadcrumbs/pwa build`
Expected: build succeeds.
Run: `grep -rn "components/TrailDetail\|components/ConfirmDialog" packages/pwa/src`
Expected: no matches.

- [ ] **Step 4: Commit**

```bash
git add -A packages/pwa/
git commit -m "refactor(pwa): adopt shared TrailDetail; [id] route becomes the container"
```

---

### Task 7: Extension adopts shared TrailDetail

**Files:**
- Modify: `packages/extension/src/history/TrailDetail.svelte` (full rewrite as thin container)
- Delete: `packages/extension/src/history/ConfirmDialog.svelte`

**Interfaces:**
- Consumes: `TrailDetail` + `TrailChangeKind` from ui (Task 5).
- Produces: same external contract as today so `App.svelte` needs no change — `Props { trail: Trail; onBack: () => void; onMutated: () => void }`.

- [ ] **Step 1: Rewrite the container**

Replace `packages/extension/src/history/TrailDetail.svelte` with:

```svelte
<script lang="ts">
  import { onMount } from "svelte";
  import type { Trail, Visit } from "@wikipedia-breadcrumbs/shared";
  import { BreadcrumbsDB, visitStore, trailStore } from "@wikipedia-breadcrumbs/shared";
  import { TrailDetail, type TrailChangeKind } from "@wikipedia-breadcrumbs/ui";

  interface Props {
    trail: Trail;
    onBack: () => void;
    onMutated: () => void;
  }

  let { trail: initialTrail, onBack, onMutated }: Props = $props();

  const db = new BreadcrumbsDB();
  const visitOps = visitStore(db);
  const trailOps = trailStore(db);

  let trail = $state(initialTrail);
  let visits: Visit[] = $state([]);
  let mergeCandidates: { id: string; displayName: string }[] = $state([]);

  async function reload() {
    const fresh = await trailOps.getById(trail.id);
    if (fresh) trail = fresh;
    visits = await visitOps.getByTrailId(trail.id);

    const others = (await trailOps.getAll()).filter((t) => t.id !== trail.id);
    const candidates: { id: string; displayName: string }[] = [];
    for (const t of others) {
      if (t.name) {
        candidates.push({ id: t.id, displayName: t.name });
      } else {
        const v = await visitOps.getByTrailId(t.id);
        const first = v[0]?.title ?? "";
        const last = v[v.length - 1]?.title ?? "";
        candidates.push({ id: t.id, displayName: first ? `${first} → ${last}` : "Empty trail" });
      }
    }
    mergeCandidates = candidates;
  }

  // Refresh when tab becomes visible
  onMount(() => {
    const onVisible = () => { if (document.visibilityState === "visible") reload(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  });

  function handleChanged(kind: TrailChangeKind) {
    if (kind === "name") {
      chrome.runtime.sendMessage({ type: "trailMutated", trailId: trail.id });
    }
    reload();
  }

  async function handleSplitDone(originalId: string, newTrailId: string) {
    const isActive = trail.status === "active";

    if (isActive) {
      // Navigate the old trail's tab to its new last page
      const oldVisits = await visitOps.getByTrailId(originalId);
      const oldLastVisit = oldVisits[oldVisits.length - 1];
      if (oldLastVisit) {
        await chrome.runtime.sendMessage({
          type: "navigateActiveTrail",
          trailId: originalId,
          url: oldLastVisit.url,
        });
      }
    }
    chrome.runtime.sendMessage({ type: "trailMutated", trailId: originalId });

    // Open the new trail's last page in a new tab
    const newVisits = await visitOps.getByTrailId(newTrailId);
    const newLastVisit = newVisits[newVisits.length - 1];
    if (newLastVisit) {
      await chrome.runtime.sendMessage({
        type: "resumeTrailInNewTab",
        trailId: newTrailId,
        url: newLastVisit.url,
      });
    }

    onMutated();
  }

  function handleMergeDone(mergedTrailId: string) {
    chrome.runtime.sendMessage({ type: "trailMutated", trailId: trail.id });
    chrome.runtime.sendMessage({ type: "trailDeleted", trailId: mergedTrailId });
    onMutated();
  }

  async function handleNavigate(visit: Visit, e: MouseEvent) {
    e.preventDefault();
    if (trail.status === "active") {
      // Let the background handle navigation — it knows the real tab ID
      await chrome.runtime.sendMessage({
        type: "navigateActiveTrail",
        trailId: trail.id,
        url: visit.url,
      });
    } else {
      // Finalized trail — background creates tab and resumes trail atomically
      await chrome.runtime.sendMessage({
        type: "resumeTrailInNewTab",
        trailId: trail.id,
        url: visit.url,
      });
      onMutated();
    }
  }

  reload();
</script>

<div class="trail-detail">
  <button class="back" onclick={onBack}>&larr; Back to trails</button>

  <TrailDetail
    {db}
    {trail}
    {visits}
    {mergeCandidates}
    onNavigate={handleNavigate}
    onChanged={handleChanged}
    onSplitDone={handleSplitDone}
    onMergeDone={handleMergeDone}
  />
</div>

<style>
  .back { background: none; border: none; color: #0066cc; cursor: pointer; padding: 0; margin-bottom: 16px; }
</style>
```

Notes: the split choreography, merge messages, and navigate handler are lifted verbatim from today's file — only relocated behind the shared component's hooks. The old file's sort/focus/edit/menu logic and all styles move to the shared component. The `trailMutated` message on name save is preserved exactly (fired from `handleChanged` only for `kind === "name"`).

- [ ] **Step 2: Delete the extension ConfirmDialog**

```bash
git rm packages/extension/src/history/ConfirmDialog.svelte
```

(Its last extension consumer was the old TrailDetail — TrailList's went in Task 4.)

- [ ] **Step 3: Verify**

Run: `pnpm --filter @wikipedia-breadcrumbs/extension test`
Expected: 45/45 pass.
Run: `pnpm --filter @wikipedia-breadcrumbs/extension build`
Expected: build succeeds.
Run: `grep -rn "ConfirmDialog" packages/extension/src`
Expected: no matches.
Run: `grep -n "merge-dropdown\|sort-btn\|VisitCard" packages/extension/src/history/TrailDetail.svelte`
Expected: no matches (all of that UI now renders from the shared component).

- [ ] **Step 4: Commit**

```bash
git add -A packages/extension/
git commit -m "refactor(extension): adopt shared TrailDetail; history TrailDetail becomes a thin container"
```

---

### Task 8: Final verification + manual cross-platform pass

- [ ] **Step 1: Full automated gates**

Run each; all must be green:

```bash
pnpm --filter @wikipedia-breadcrumbs/ui check          # 0 errors, 0 warnings
pnpm -r test                                           # shared 129/129 (known same-ms flake aside), pwa 10/10, extension 45/45
pnpm --filter @wikipedia-breadcrumbs/pwa build
pnpm --filter @wikipedia-breadcrumbs/extension build
pnpm --filter @wikipedia-breadcrumbs/shared build
```

- [ ] **Step 2: Structural greps (duplication actually gone)**

```bash
git grep -n "TrailList\|TrailDetail" -- packages/pwa/src | grep -v "wikipedia-breadcrumbs/ui"
# Expected: only the two route pages' local usage of the imported components.
ls packages/pwa/src/lib/components/
# Expected: no TrailList.svelte, TrailDetail.svelte, or ConfirmDialog.svelte.
git grep -rn "ConfirmDialog" -- packages/pwa/src packages/extension/src
# Expected: no matches.
```

- [ ] **Step 3: Manual smoke test (operator, both platforms)**

Hands-on pass per the project's verification workflow — visual parity and behavior on both platforms:

1. **PWA trails list:** search, all three sorts, star/unstar, delete (confirm dialog names the trail), import/export menu, active badge + date-range meta now visible, title wave on sync.
2. **PWA trail detail:** name/note inline edit (save on blur, no layout shift), star, merge (dropdown labels), split (only in discovery-asc), export, focused view (click card → parent/children), navigate between two trail URLs (deps re-subscription), title wave animates the trail name via the header snippet.
3. **Extension history list:** same list checks; delete sends `trailDeleted`; import triggers `refresh()`; PWA-canon card styling and copy (deliberate change — see Locked Decisions #4).
4. **Extension history detail:** back button; name save fires `trailMutated` (rename reflected in popup); note/star edits persist and reload; visit link click → `navigateActiveTrail`/`resumeTrailInNewTab` (no double navigation — preventDefault in container); split choreography (old tab navigates, new tab opens); merge fires both messages; sort prefs now per-trail; note editing in discovery/focused views does not tear down the textarea (the `.note` focus-guard fix from phase 1 is inherited from the shared markup).

- [ ] **Step 4: Hand back**

Do NOT merge — hand back to the operator for review and manual testing (the operator merges only on explicit say-so).

## Final verification checklist

- [ ] `pnpm --filter @wikipedia-breadcrumbs/ui check` — 0/0.
- [ ] `pnpm -r test` — shared 129/129, pwa 10/10, extension 45/45.
- [ ] All three builds green.
- [ ] `packages/pwa/src/lib/components/` contains none of: TrailList, TrailDetail, ConfirmDialog.
- [ ] No `ConfirmDialog` references left in either app's `src/`.
- [ ] `packages/extension/src/history/TrailList.svelte` and `TrailDetail.svelte` are thin containers (no list/detail UI markup of their own).
- [ ] `packages/extension/src/history/App.svelte` untouched.
- [ ] Manual cross-platform pass complete (operator).

## Self-review notes (coverage vs. spec)

- TrailList contract (summaries in, `onSelectTrail`/`onDeleteTrail`/star callback out, embeds shared ImportDialog) → Task 2; unified active badge + full meta → Task 2 template.
- TrailDetail contract (data in, callbacks out, sort prefs internal via localStorage, optional `header` snippet for the PWA title-wave, plain heading default) → Task 5.
- Injected seams: `db` prop (both apps pass it — extension instantiates in containers, PWA passes its singleton) → Tasks 3–7; `getDeviceId` async-unified → Tasks 3–4; navigation via optional `onNavigate` with preventDefault in the extension container → Tasks 5/7; trail selection callback (PWA implements with `goto`) → Task 3.
- "TrailList/TrailDetail extraction happens after liveQuery" → satisfied; the PWA containers are built on the landed liveQuery queriers.
- One canonical scoped stylesheet per component, PWA canonical → Tasks 2/5.
- Each rollout step lands independently (apps build, tests pass, duplicate deleted in the same change) → Tasks 3, 4, 6, 7 each carry their own gates; deletions ride the task that removes the last consumer.
- Testing section (svelte-check in CI, app builds/suites green per step, manual pass per component) → per-task gates + Task 8. No extension component tests exist for these files (verified: extension tests cover background/content/shared logic only), so nothing to move.
- Out of scope respected: no design tokens, no Storybook, no extension liveQuery, no behavior changes beyond the named canonicalizations (Locked Decisions #4).
