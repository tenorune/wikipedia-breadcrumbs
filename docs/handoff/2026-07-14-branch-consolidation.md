# Handoff — 2026-07-14

## What this is

Wikipedia Breadcrumbs — pnpm monorepo at `/Users/tenorune/Public/wikipedia-breadcrumbs`:
`packages/shared` (pure TS), `packages/extension` (Chrome MV3), `packages/pwa`
(SvelteKit), `packages/ui` (shared raw-`.svelte` components). This session did **branch
cleanup + planning**, not feature code.

## What's next (pick one)

1. **Execute the offscreen-document removal** (#39) off `dev` — plan is written and ready:
   `docs/superpowers/plans/2026-07-14-remove-offscreen-document.md`. Subagent-driven
   (implementer → per-task review → opus whole-branch review), same as prior plans.
2. **Write the shared-UI phase-2 plan** (TrailList/TrailDetail extraction) — the task this
   session was originally spun up for, never done. Spec: `git`-tracked
   `docs/superpowers/specs/2026-07-13-shared-ui-package-design.md` (TrailList/TrailDetail
   sections). Write against current `dev` sources (post-liveQuery PWA + post-phase-1
   extension).
3. **Progress workstream B** — see the disposition analysis (below).

Nothing is mid-flight; all three are clean starting points.

## On-ramp pointers (source of truth)

- Auto-memory `execution-progress-2026-07-14` loads automatically — the live status.
- `docs/ROADMAP.md` — forward-only; what's shipped vs. next.
- `docs/analysis/2026-07-14-workstream-b-safari-disposition.md` — the full workstream-B
  (Safari) analysis: three piles, what's Safari-only vs cross-browser, issue map,
  open decisions. Read before touching `safari`.
- `docs/superpowers/plans/` + `docs/superpowers/specs/` — all design docs now live on `dev`.

## Environment

- pnpm **11.1.2** (pinned). PWA build needs `packages/pwa/.env`; extension `build:dev`
  needs `packages/extension/.env.dev` (both present locally).
- Tests: `pnpm -r test` (or `pnpm --filter @wikipedia-breadcrumbs/<pkg> test`).
- Builds: `pnpm --filter @wikipedia-breadcrumbs/<pkg> build`.
- Package check (ui): `pnpm --filter @wikipedia-breadcrumbs/ui check`.
- **Verified green at handoff:** shared 129/129, pwa 10/10, extension 45/45; all three
  builds OK. (`visits.test.ts` same-ms `updatedAt` test is timing-flaky — passed this
  run, may fail on a fast machine; out of scope.)

## Conventions

- Branch off `dev` (the workstream-A integration branch). Squash-merge PRs.
- Commit trailer, kept consistent across the series:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Operator pushes-for-backup but **merges only on explicit say-so** — do not nudge toward
  merging. Manual testing spans many turns; a green build is not a cue to wrap up.

## Working style

Operator drives the loop, decides pace, and says when something is "done." Prefers bounded
choices with a recommendation over open questions. Wants evidence (OBSERVED vs UNKNOWN),
not assertions. Terse cues ("y", "go") mean proceed.

---

## Landmines / gotchas

- **Shared working copy across terminals.** A `git checkout` in another terminal changes
  the branch for THIS session too (same working directory). Mid-session the tree was found
  on `dev` because of an external checkout; verify `git branch --show-current` if things
  look off.
- **`visits.test.ts > update … sets updatedAt`** is a same-millisecond flake (asserts two
  identical-ms timestamps differ). Byte-identical to `main`; not a regression. Ignore.
- **Offscreen plan ↔ plan 1 interaction:** `dev` carries `f45bc50`
  (`restampForUser` in `offscreen/sync-handler.ts`). The #39 plan's `sync-layer.ts` should
  call `restampForUser`, not the inline stamping loops (noted in the plan's Task 3).
- **Offscreen removal must NOT drag in pile 2.** Keep `webNavigation`/`tabs`/
  `host_permissions`; remove only the `"offscreen"` permission. Content-script capture is
  the separate #60 decision with a real `transitionType`/auto-split regression.
- **Don't delete `safari`.** It is the only branch holding piles 2 and 3, and the
  reference implementation for the #39 re-derivation.
- Git script hygiene: don't pipe a critical `git push`/`merge` through `tail`/`grep` under
  `set -e` — the pipe masks the git exit status and `set -e` won't halt (bit this session).

---

## History — skip unless relevant

This session, starting from a tangled 8-branch repo:

- **Consolidated workstream A onto a new `dev`.** Deleted the stale Safari-checkpoint
  `dev`; created `dev` off `main`; fast-forwarded in plans 2-4 (`feat/shared-ui-package`)
  and merged plan 1 (`feat/sync-write-path`, independent branch). Deleted the redundant
  labels (`chore/pnpm-toolchain-11`, `feat/service-worker-offline-update`,
  `feat/pwa-livequery`, then `feat/shared-ui-package`, `feat/sync-write-path`). Folded the
  `docs/roadmap-and-specs-2026-07-13` planning-docs branch into `dev` and deleted it.
- **Reopened #39** and drafted the offscreen-removal plan against current `dev`.
- **Analyzed workstream B** (the `safari` branch) → the disposition doc.
- Result: **3 branches** — `dev` (all workstream A code + all specs/plans), `main` (trunk),
  `safari` (workstream B, parked).

Full per-plan commit map and older design history live in `docs/superpowers/plans/` and git.
