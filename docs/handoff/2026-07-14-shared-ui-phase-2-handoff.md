# Handoff — 2026-07-14 — Execute Shared-UI Phase 2

## What this is

Wikipedia Breadcrumbs — pnpm monorepo at `/Users/tenorune/Public/wikipedia-breadcrumbs`:
`packages/shared` (pure TS), `packages/extension` (Chrome MV3), `packages/pwa` (SvelteKit),
`packages/ui` (shared raw-`.svelte` components). Work happens on `dev` (integration branch).

## What's next (the one action)

**Execute the shared-UI phase-2 plan:** `docs/superpowers/plans/2026-07-14-shared-ui-phase-2.md`.
It extracts the duplicated `TrailList` and `TrailDetail` components (and moves `ConfirmDialog`)
into `packages/ui` as presentational components — data/db/navigation injected via props and
callbacks. 8 tasks, self-contained, written against current `dev` sources.

- Branch `feat/shared-ui-phase-2` off `dev`.
- Run it with **superpowers:subagent-driven-development** (the plan's header names this): a fresh
  implementer subagent per task → per-task spec+quality review → opus whole-branch review at the end.
  Progress ledger convention lives at `.superpowers/sdd/progress.md` (append, don't rewrite).
- Do NOT merge at the end — hand back for the operator's manual cross-platform pass (plan Task 8).

## On-ramp pointers (source of truth)

- Auto-memory `execution-progress-2026-07-14` loads automatically — the live status.
- The **plan** is self-contained (full component code, containers, gates, and a "Locked Decisions"
  section explaining the design choices and deliberate behavior deltas). Read it before the spec.
- `docs/superpowers/specs/2026-07-13-shared-ui-package-design.md` — the design spec it implements
  (TrailList/TrailDetail sections).
- `docs/ROADMAP.md` — forward-only.

## Environment

- pnpm **11.1.2** (pinned). PWA build needs `packages/pwa/.env`; extension `build:dev` needs
  `packages/extension/.env.dev` (both present locally).
- Tests: `pnpm -r test`, or per-package `pnpm --filter @wikipedia-breadcrumbs/<pkg> test`.
- Builds: `pnpm --filter @wikipedia-breadcrumbs/<pkg> build`.
- **`packages/ui` gate:** `pnpm --filter @wikipedia-breadcrumbs/ui check` (svelte-check; the package
  ships raw `.svelte` with no build step and has no vitest harness).
- **Verified green on `dev` at handoff:** shared 131/131, pwa 10/10, extension 42/42; all three
  builds pass. (The shared suite has one same-ms `visits.test.ts:56` `updatedAt` flake that
  passes/fails run-to-run — ignore it, it's unrelated and pre-existing.)

## Conventions

- Branch off `dev`. Squash or no-ff per the operator's call at merge time.
- Commit trailer, every commit: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- **Operator merges only on explicit say-so** — do not nudge toward merging. Manual testing spans
  many turns; a green build is not a cue to wrap up.
- Prefers bounded choices with a recommendation over open questions; wants evidence (OBSERVED vs
  UNKNOWN), not assertions. Terse cues ("y", "go") mean proceed.

---

## Landmines / gotchas

- **Shared working copy across terminals.** A `git checkout` in another terminal switches the branch
  for THIS session too (same working dir). Verify `git branch --show-current` if the tree looks wrong.
- **Deliberate behavior deltas (do not "fix").** The plan's *Locked Decisions §4* lists intended
  cross-platform changes: the extension list adopts PWA copy/styling (loses "Browse Wikipedia to
  start!", "Oldest First"→"Oldest", divider rows→cards); the PWA gains the active badge + date-range
  meta; extension detail sort prefs move to the PWA per-trail localStorage key scheme (old global
  `trailDetailSort` orphaned, not migrated); extension merge candidates load eagerly on mount. These
  are spec-driven unifications — verify against the plan, don't revert them.
- **Mutation-ownership asymmetry is intentional** (Locked Decisions §3): `TrailList` fires callbacks
  and each app owns its DB write; `TrailDetail` keeps its byte-identical mutations *inside* the shared
  component and exposes post-write hooks (`onChanged`/`onSplitDone`/`onMergeDone`) that the extension
  augments with chrome messages. Don't try to make them symmetric.
- **`ConfirmDialog` moves into `packages/ui`.** Its only consumers are the four extracted files, so
  both app copies are deleted by the end (Task 3 removes PWA TrailList's, Task 6 the PWA TrailDetail +
  PWA ConfirmDialog, Task 7 the extension ConfirmDialog). PWA styling is canonical.
- **`packages/ui` has no vitest harness** — phase-2 adds no new unit tests; the queriers feeding the
  components are already TDD-covered in `packages/pwa/tests/queries.test.ts`. Gates are `ui check`,
  app builds, app suites, and the structural greps in each task.
- **Don't delete the `safari` branch** (workstream B, parked — the only branch holding piles 2/3).

---

## History — skip unless relevant

- **This session:** merged **#39 remove-offscreen-document** into `dev` (`d7ea1e1`, pushed). The MV3
  service worker now runs Dexie + Supabase directly via extracted `data-layer`/`auth-layer`/`sync-layer`
  modules + a `chrome.storage.local` session adapter; manifest dropped only the `offscreen` permission.
  6 tasks + opus whole-branch review (With fixes → one Important, a stale `messaging.test.ts`, fixed in
  `d476a75`). **#39's only remaining step is the operator manual smoke test** (auth across SW restart,
  sync timestamp) with real Supabase creds — no automated test exercises a live SW. Full task log and
  deferred non-blocking minors: `.superpowers/sdd/progress.md` (#39 section).
- Also this session: **wrote** the phase-2 plan (the "what's next" above).
- `feat/remove-offscreen-document` @ `d476a75` is fully merged into `dev` but still exists locally —
  safe to `git branch -d` anytime.
- Older history (plans 1-4 phase 1 consolidation, branch cleanup, workstream-B analysis) lives in
  `docs/superpowers/plans/`, `docs/analysis/`, and git.
