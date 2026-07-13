# Shared UI Package (`packages/ui`) Implementation Plan — Phase 1

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create `@wikipedia-breadcrumbs/ui` (raw-`.svelte` workspace package) and migrate the first two shared components: ImportDialog (pilot) and VisitCard.

**Architecture:** The package ships uncompiled `.svelte` files via the `svelte` export condition; each app's own Svelte 5/Vite toolchain compiles them. Components are presentational — db instance, `getDeviceId`, and navigation arrive via props/callbacks. Phase 1 scope is deliberate: **TrailList/TrailDetail extraction is a follow-up plan** written after this phase and the liveQuery work have landed (their PWA sides are reshaped by `2026-07-13-pwa-livequery.md`).

**Tech Stack:** Svelte 5, pnpm workspaces, svelte-check, Vitest (extension suite must stay green).

**Spec:** `docs/superpowers/specs/2026-07-13-shared-ui-package-design.md`

## Global Constraints

- **Toolchain first:** reconcile the pnpm 10→11 lockfile drift before installing (see `docs/ROADMAP.md` chores). PWA build needs `packages/pwa/.env`.
- Execute AFTER the liveQuery plan: PWA call-site instructions below assume the post-liveQuery files.
- Work on a feature branch off `main`; commits end with the `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` trailer.
- Styling canon is the **PWA variant** of each component (spec: "both platforms are one product"); extension visuals change slightly (rounder corners, carded VisitCard) — expected, verified manually, not a regression.
- Discovery baked into this plan: **both existing `ImportDialog.svelte` files are dead code** (zero imports anywhere; each TrailList inlines its own copy of the import flow). The pilot therefore *adopts* the shared component in both TrailLists and deletes the orphans — pure file-moving would extract dead code.
- Key prop-contract unifications: `onUpdateNote(id, note: string | null)` (PWA semantics — extension's handler signature widens); navigation via optional `onNavigate(visit, event)` (extension wires chrome messages there; PWA relies on the default `<a target="_blank">`).

---

### Task 1: Scaffold `packages/ui`

**Files:**
- Create: `packages/ui/package.json`
- Create: `packages/ui/tsconfig.json`
- Create: `packages/ui/src/index.ts`
- Modify: `packages/extension/package.json`, `packages/pwa/package.json` (add the workspace dep)

**Interfaces:**
- Produces: importable `@wikipedia-breadcrumbs/ui` in both apps; `pnpm --filter @wikipedia-breadcrumbs/ui check` as the package's CI gate. Component exports are added by later tasks.

- [ ] **Step 1: Create the package**

`packages/ui/package.json`:

```json
{
  "name": "@wikipedia-breadcrumbs/ui",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "svelte": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "svelte": "./src/index.ts",
      "default": "./src/index.ts"
    },
    "./*.svelte": {
      "svelte": "./src/*.svelte",
      "default": "./src/*.svelte"
    }
  },
  "scripts": {
    "check": "svelte-check --tsconfig ./tsconfig.json"
  },
  "peerDependencies": {
    "svelte": "^5.0.0"
  },
  "dependencies": {
    "@wikipedia-breadcrumbs/shared": "workspace:*"
  },
  "devDependencies": {
    "svelte": "^5.55.7",
    "svelte-check": "^4.1.0",
    "typescript": "^5.7.0"
  }
}
```

No build script — raw `.svelte`/`.ts` ships as-is; `vite-plugin-svelte` in each app compiles it (packages with a `svelte` field are handled automatically).

`packages/ui/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "verbatimModuleSyntax": true
  },
  "include": ["src/**/*.ts", "src/**/*.svelte"]
}
```

`packages/ui/src/index.ts`:

```typescript
// Components are re-exported here as they are extracted.
export {};
```

- [ ] **Step 2: Wire both apps**

Add to `dependencies` in `packages/extension/package.json` and `packages/pwa/package.json`:

```json
    "@wikipedia-breadcrumbs/ui": "workspace:*"
```

Run `pnpm install` at the workspace root.

- [ ] **Step 3: Verify**

Run: `pnpm --filter @wikipedia-breadcrumbs/ui check`
Expected: 0 errors, 0 files with issues (nothing to check yet is fine).
Run: `pnpm --filter @wikipedia-breadcrumbs/extension build && pnpm --filter @wikipedia-breadcrumbs/pwa build`
Expected: both still build (dep resolves, unused).

- [ ] **Step 4: Commit**

```bash
git add packages/ui packages/extension/package.json packages/pwa/package.json pnpm-lock.yaml
git commit -m "feat(ui): scaffold @wikipedia-breadcrumbs/ui raw-svelte package"
```

---

### Task 2: Shared ImportDialog + adopt in PWA TrailList

**Files:**
- Create: `packages/ui/src/ImportDialog.svelte`
- Modify: `packages/ui/src/index.ts`
- Modify: `packages/pwa/src/lib/components/TrailList.svelte` (remove inlined import flow)
- Delete: `packages/pwa/src/lib/components/ImportDialog.svelte` (dead code)

**Interfaces:**
- Produces: `ImportDialog` from `@wikipedia-breadcrumbs/ui` with props `{ db: BreadcrumbsDB; getDeviceId: () => Promise<string>; onComplete?: () => void }` and an instance method `start(): Promise<void>` (call via `bind:this`). Renders its own error/result banners and the conflict-resolution overlay; renders **no trigger button** — the parent's existing menu item calls `start()`.

- [ ] **Step 1: Create the component**

Create `packages/ui/src/ImportDialog.svelte` (logic is the identical script both apps duplicate today; banners/dialog markup and styles are the PWA TrailList's block-level versions):

```svelte
<script lang="ts">
  import { parseImportJson, detectConflicts, executeImport, pickFile } from "@wikipedia-breadcrumbs/shared";
  import type { BreadcrumbsDB, ConflictItem, ImportPlan } from "@wikipedia-breadcrumbs/shared";

  interface Props {
    db: BreadcrumbsDB;
    getDeviceId: () => Promise<string>;
    onComplete?: () => void;
  }
  let { db, getDeviceId, onComplete }: Props = $props();

  let conflicts = $state<ConflictItem[]>([]);
  let cleanTrails = $state<any[]>([]);
  let decisions = $state<Record<string, "skip" | "overwrite" | "copy">>({});
  let result = $state<{ trailsImported: number; visitsImported: number; skipped: number; errors: string[] } | null>(null);
  let error = $state("");
  let showDialog = $state(false);

  export async function start(): Promise<void> {
    error = "";
    result = null;
    const content = await pickFile(".json");
    if (!content) return;

    const parsed = parseImportJson(content);
    if (parsed.errors.length > 0) {
      error = parsed.errors.join("\n");
      return;
    }

    const detected = await detectConflicts(db, parsed.trails);
    cleanTrails = detected.clean;

    if (detected.conflicts.length > 0) {
      conflicts = detected.conflicts;
      decisions = {};
      for (const c of detected.conflicts) {
        decisions[c.imported.id] = "skip";
      }
      showDialog = true;
    } else {
      await doImport(detected.clean, []);
    }
  }

  async function confirmImport() {
    showDialog = false;
    const resolved = conflicts.map((c) => ({
      trail: c.imported,
      action: decisions[c.imported.id],
    }));
    await doImport(cleanTrails, resolved);
  }

  async function doImport(clean: any[], resolved: any[]) {
    const plan: ImportPlan = {
      items: [
        ...clean.map((t: any) => ({ trail: t, action: "overwrite" as const })),
        ...resolved,
      ],
    };
    const deviceId = await getDeviceId();
    result = await executeImport(db, plan, { userId: null, deviceId });
    onComplete?.();
  }
</script>

{#if error}
  <div class="import-error">{error}</div>
{/if}
{#if result}
  <div class="import-result">
    Imported {result.trailsImported} trail{result.trailsImported === 1 ? "" : "s"}
    ({result.visitsImported} visit{result.visitsImported === 1 ? "" : "s"}).
    {#if result.skipped > 0}Skipped {result.skipped}.{/if}
    {#if result.errors.length > 0}
      <div class="import-errors">{result.errors.join("; ")}</div>
    {/if}
  </div>
{/if}

{#if showDialog}
  <div class="conflict-overlay">
    <div class="conflict-dialog">
      <h3>Import Conflicts</h3>
      <p>{conflicts.length} trail{conflicts.length === 1 ? "" : "s"} already exist{conflicts.length === 1 ? "s" : ""} locally.</p>
      {#each conflicts as conflict}
        <div class="conflict-item">
          <strong>{conflict.imported.name ?? (conflict.imported.visits.length > 0 ? `${conflict.imported.visits[0].title} → ${conflict.imported.visits[conflict.imported.visits.length - 1].title}` : "Empty trail")}</strong>
          <span>({conflict.imported.visits.length} visits)</span>
          <div class="conflict-actions">
            <label><input type="radio" bind:group={decisions[conflict.imported.id]} value="skip" /> Skip</label>
            <label><input type="radio" bind:group={decisions[conflict.imported.id]} value="overwrite" /> Overwrite</label>
            <label><input type="radio" bind:group={decisions[conflict.imported.id]} value="copy" /> Import as copy</label>
          </div>
        </div>
      {/each}
      <div class="dialog-actions">
        <button class="confirm" onclick={confirmImport}>Import</button>
        <button onclick={() => { showDialog = false; }}>Cancel</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .import-error { color: #dc3545; font-size: 12px; margin-bottom: 10px; white-space: pre-wrap; }
  .import-result { font-size: 12px; color: #155724; background: #d4edda; padding: 6px 10px; border-radius: 6px; margin-bottom: 10px; }
  .import-errors { color: #dc3545; margin-top: 4px; }
  .conflict-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 100; }
  .conflict-dialog { background: white; border-radius: 12px; padding: 20px; max-width: 500px; width: 90%; max-height: 80vh; overflow-y: auto; }
  .conflict-dialog h3 { margin: 0 0 8px; }
  .conflict-dialog p { font-size: 13px; color: #666; margin: 0 0 12px; }
  .conflict-item { margin: 12px 0; padding: 10px; border: 1px solid #e8e8e8; border-radius: 8px; }
  .conflict-actions { display: flex; gap: 12px; margin-top: 6px; font-size: 13px; }
  .conflict-actions label { display: flex; align-items: center; gap: 4px; cursor: pointer; }
  .dialog-actions { display: flex; gap: 8px; margin-top: 16px; }
  .dialog-actions button { padding: 6px 16px; border: 1px solid #ddd; border-radius: 6px; cursor: pointer; background: white; }
  .dialog-actions .confirm { background: #0066cc; color: white; border: none; }
</style>
```

`packages/ui/src/index.ts`:

```typescript
export { default as ImportDialog } from "./ImportDialog.svelte";
```

Run: `pnpm --filter @wikipedia-breadcrumbs/ui check` → clean.

- [ ] **Step 2: Adopt in the PWA TrailList**

In `packages/pwa/src/lib/components/TrailList.svelte` (post-liveQuery shape):

Script — remove the inlined flow: the `importConflicts/importClean/importDecisions/importResult/importError/showConflictDialog` `$state` declarations and the `handleImport`/`confirmImport`/`doImport` functions; drop `parseImportJson, detectConflicts, executeImport, pickFile` and `ConflictItem, ImportPlan` from the shared imports (keep the export helpers). Add:

```typescript
  import { ImportDialog } from "@wikipedia-breadcrumbs/ui";

  let importer: { start: () => Promise<void> } | undefined = $state();
```

Template — in the data menu, the Import button becomes:

```svelte
        <button onclick={() => { dataMenuOpen = false; importer?.start(); }}>Import</button>
```

Replace the `{#if importError}` and `{#if importResult}` banner blocks and the whole `{#if showConflictDialog}` overlay block with a single instance placed where the banners were (after the `.controls` div; no `onComplete` needed — liveQuery refreshes the list):

```svelte
<ImportDialog bind:this={importer} {db} getDeviceId={async () => getDeviceId()} />
```

Styles — delete the now-unused rules: `.import-error`, `.import-result`, `.import-errors`, `.conflict-overlay`, `.conflict-dialog`, `.conflict-dialog h3`, `.conflict-dialog p`, `.conflict-item`, `.conflict-actions`, `.conflict-actions label`, `.dialog-actions`, `.dialog-actions button`, `.dialog-actions .confirm`.

Delete the dead file:

```bash
git rm packages/pwa/src/lib/components/ImportDialog.svelte
```

- [ ] **Step 3: Verify**

Run: `pnpm --filter @wikipedia-breadcrumbs/pwa build`
Manual (dev server): menu → Import a JSON export — clean import shows the result banner; a conflicting import opens the dialog, all three resolutions work; a malformed file shows the error banner; list refreshes itself.

- [ ] **Step 4: Commit**

```bash
git add packages/ui packages/pwa/src/lib/components/TrailList.svelte
git commit -m "feat(ui): shared ImportDialog; adopt in PWA TrailList"
```

---

### Task 3: Adopt ImportDialog in the extension TrailList

**Files:**
- Modify: `packages/extension/src/history/TrailList.svelte`
- Delete: `packages/extension/src/history/ImportDialog.svelte` (dead code)

**Interfaces:**
- Consumes: `ImportDialog` (Task 2). Extension passes its async `getDeviceId` directly and refreshes via `onComplete`.

- [ ] **Step 1: Replace the inlined flow**

In `packages/extension/src/history/TrailList.svelte`:

Script — remove the same six import-flow `$state` declarations (lines 20-25) and `handleImport`/`confirmImport`/`doImport` (lines 35-71); drop `parseImportJson, detectConflicts, executeImport, pickFile` and `ConflictItem, ImportPlan` from the shared imports (keep export helpers and `getDeviceId`). Add:

```typescript
  import { ImportDialog } from "@wikipedia-breadcrumbs/ui";

  let importer: { start: () => Promise<void> } | undefined = $state();
```

Template — data-menu Import button calls `importer?.start()` (same pattern as Task 2 Step 2); replace this file's import banners + conflict-dialog blocks with:

```svelte
<ImportDialog bind:this={importer} {db} {getDeviceId} onComplete={() => refresh()} />
```

Styles — delete the same now-unused rule set as in Task 2 Step 2 (this file's copies).

```bash
git rm packages/extension/src/history/ImportDialog.svelte
```

- [ ] **Step 2: Verify**

Run: `pnpm --filter @wikipedia-breadcrumbs/extension test && pnpm --filter @wikipedia-breadcrumbs/extension build`
Expected: 45/45, clean build. Manual (load `dist` unpacked): history page → Import flow end-to-end incl. conflict dialog; list refreshes after import.

- [ ] **Step 3: Commit**

```bash
git add packages/extension/src/history/TrailList.svelte
git commit -m "feat(extension): adopt shared ImportDialog"
```

---

### Task 4: Shared VisitCard + switch the PWA

**Files:**
- Create: `packages/ui/src/VisitCard.svelte`
- Modify: `packages/ui/src/index.ts`
- Modify: `packages/pwa/src/lib/components/TrailDetail.svelte` (import path only)
- Delete: `packages/pwa/src/lib/components/VisitCard.svelte`

**Interfaces:**
- Produces: `VisitCard` from `@wikipedia-breadcrumbs/ui` with props:
  ```typescript
  interface Props {
    visit: Visit;
    onUpdateNote: (id: string, note: string | null) => void;
    onDelete: (id: string) => void;
    onSplit?: (position: number) => void;
    onNavigate?: (visit: Visit, e: MouseEvent) => void; // intercepts the title link
    showLanguageBadge?: boolean;
  }
  ```
  Behavior canon = PWA: year-aware time format, "Copied!" cite feedback, note save on blur/input, block styling (`.card` with border).

- [ ] **Step 1: Create from the PWA variant**

Copy the current PWA component into the package:

```bash
cp packages/pwa/src/lib/components/VisitCard.svelte packages/ui/src/VisitCard.svelte
```

Then apply exactly two modifications to `packages/ui/src/VisitCard.svelte`:

1. Props — replace the `interface Props` block and destructuring (current lines 5-13) with:

```typescript
  interface Props {
    visit: Visit;
    onUpdateNote: (id: string, note: string | null) => void;
    onDelete: (id: string) => void;
    onSplit?: (position: number) => void;
    onNavigate?: (visit: Visit, e: MouseEvent) => void;
    showLanguageBadge?: boolean;
  }

  let { visit, onUpdateNote, onDelete, onSplit, onNavigate, showLanguageBadge }: Props = $props();
```

2. Title link — replace the anchor (current lines 164-166) with (default behavior unchanged when `onNavigate` is absent; interceptors must call `preventDefault` themselves):

```svelte
    <a class="title" href={visit.url} target="_blank" rel="noopener noreferrer"
      onclick={onNavigate ? (e) => onNavigate(visit, e) : undefined}>
      {visit.title}
    </a>
```

Add to `packages/ui/src/index.ts`:

```typescript
export { default as VisitCard } from "./VisitCard.svelte";
```

Run: `pnpm --filter @wikipedia-breadcrumbs/ui check` → clean.

- [ ] **Step 2: Switch the PWA call site**

In `packages/pwa/src/lib/components/TrailDetail.svelte`, replace

```typescript
  import VisitCard from "./VisitCard.svelte";
```

with

```typescript
  import { VisitCard } from "@wikipedia-breadcrumbs/ui";
```

(All four usages pass `visit/onUpdateNote/onDelete/onSplit?/showLanguageBadge` — unchanged contract; no `onNavigate`.)

```bash
git rm packages/pwa/src/lib/components/VisitCard.svelte
```

- [ ] **Step 3: Verify**

Run: `pnpm --filter @wikipedia-breadcrumbs/pwa build`
Manual: trail detail — cards render identically; note add/edit/delete, cite copy ("Copied!"), split, delete, language badge all behave as before; links open in a new tab.

- [ ] **Step 4: Commit**

```bash
git add packages/ui packages/pwa/src/lib/components/TrailDetail.svelte
git commit -m "feat(ui): shared VisitCard; adopt in PWA"
```

---

### Task 5: Switch the extension to the shared VisitCard

**Files:**
- Modify: `packages/extension/src/history/TrailDetail.svelte`
- Delete: `packages/extension/src/history/VisitCard.svelte`

**Interfaces:**
- Consumes: `VisitCard` (Task 4). The extension's trail-aware navigation (chrome messages) moves into a `handleNavigate` callback here — the component no longer knows about `trailId`/`trailStatus`/`onResumed`.

- [ ] **Step 1: Update TrailDetail**

In `packages/extension/src/history/TrailDetail.svelte`:

Replace the import (line 5):

```typescript
  import { VisitCard } from "@wikipedia-breadcrumbs/ui";
```

Widen the note handler (line 257) to the shared signature — `visitOps.update` accepts `note: string | null` already:

```typescript
  async function handleUpdateNote(visitId: string, note: string | null) {
```

(the body is unchanged.)

Add the navigation callback (near the other handlers; `trail` and `onMutated` are existing component props — the logic is moved verbatim from the old VisitCard's `handleTitleClick`):

```typescript
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
      onMutated?.();
    }
  }
```

At all four `<VisitCard` usages (lines ~365, ~380, ~397, ~421): **remove** the `trailId={...}`, `trailStatus={...}`, and `onResumed={onMutated}` props; **add** `onNavigate={handleNavigate}`. The `visit/onUpdateNote/onDelete/onSplit?/showLanguageBadge` props stay as they are.

```bash
git rm packages/extension/src/history/VisitCard.svelte
```

- [ ] **Step 2: Verify**

Run: `pnpm --filter @wikipedia-breadcrumbs/extension test && pnpm --filter @wikipedia-breadcrumbs/extension build`
Expected: 45/45 (if any test imports the deleted `history/VisitCard.svelte`, repoint it to `@wikipedia-breadcrumbs/ui` — the contract minus trail props is unchanged), clean build.
Manual (load unpacked): active trail — clicking a visit title navigates the trail's tab; finalized trail — click resumes in a new tab; notes, cite, split, delete, language badge all work. Visual change to expect: cards are now bordered/rounded (PWA canon) instead of flat with divider lines.

- [ ] **Step 3: Commit**

```bash
git add packages/extension/src/history/TrailDetail.svelte
git commit -m "feat(extension): adopt shared VisitCard with onNavigate callback"
```

---

### Task 6: Schedule Phase 2

- [ ] **Step 1: Write the follow-up plan**

TrailList/TrailDetail extraction (spec rollout steps 3-4) gets its own plan — `docs/superpowers/plans/<date>-shared-ui-package-phase2.md` — written **after** this phase merges, against the then-current sources (post-liveQuery PWA + post-Phase-1 extension). Same package, same presentational rules; the spec's TrailList/TrailDetail contract sections apply. Do not attempt it from this document.

---

## Final verification

- [ ] `pnpm -r test` — extension 45/45, PWA suite green, shared green (except the known `visits.test.ts` same-ms failure).
- [ ] `pnpm --filter @wikipedia-breadcrumbs/ui check` — clean.
- [ ] `grep -rn "ImportDialog\|VisitCard" packages/extension/src packages/pwa/src` — only `@wikipedia-breadcrumbs/ui` imports remain.
- [ ] Manual side-by-side pass on both platforms (import flow, visit cards) per the project's hands-on workflow.
- [ ] Do NOT merge — hand back to the operator for review/manual testing.
