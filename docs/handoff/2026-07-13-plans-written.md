# Handoff — roadmap + specs + plans done, ready to execute

**Date:** 2026-07-13
**Repo:** `wikipedia-breadcrumbs` (`/Users/tenorune/Public/wikipedia-breadcrumbs`), monorepo: `packages/shared`, `packages/extension`, `packages/pwa`, `supabase/functions`.

## What this is

The planning session for the 4 accepted optimization items is **complete**. There is now a roadmap, a design spec per item, and an implementation plan per item — all on branch `docs/roadmap-and-specs-2026-07-13` (committed, pushed, **unmerged — kept for human review**). Nothing has been implemented yet. This is a docs-only branch; no product code changed.

## What's next

**Execute plan 1 (sync write path).** But first, two gates:

1. **Human review of the specs/plans** — the human asked to keep the branch unmerged so they can review before implementation starts. Confirm they've reviewed (or want changes) before executing.
2. **Reconcile the pnpm toolchain drift** — a hard prerequisite for *every* plan (see Landmines). Skippable only while purely writing docs; the moment you run install/test/build it will bite.

Then pick execution mode — each plan's header offers **subagent-driven** (fresh subagent per task, review between tasks — recommended) or **inline** (executing-plans). Implement in roadmap order: 1 → 2 → 3 → 4.

## On-ramp pointers (source of truth)

- **`docs/ROADMAP.md`** — the 4 items, each linking its spec + plan, plus sequencing rationale, locked decisions, exclusions, and the chores. Start here.
- **Specs:** `docs/superpowers/specs/2026-07-13-*.md` (sync-write-path, service-worker-offline-update, pwa-livequery, shared-ui-package). The "why" and design decisions.
- **Plans:** `docs/superpowers/plans/2026-07-13-*.md` — TDD task breakdowns with complete code, exact commands, commit steps. The "how."
- **Analysis (original findings):** `docs/analysis/2026-07-12-optimization-and-feature-analysis.html` — where each `opt #N` / `UX #N` is defined.
- **Auto-memory:** `roadmap-accepted-sequence`, `external-pwa-auto-update-doc`, `pnpm-toolchain-drift` load automatically next session.

## Environment essentials — commands

Per package (once pnpm is reconciled — see Landmines):
- Test: `pnpm --filter @wikipedia-breadcrumbs/shared test` · `… extension test` · `… pwa test` (PWA test harness is **created by plan 2 / plan 3** — it doesn't exist yet).
- Build: `pnpm --filter @wikipedia-breadcrumbs/shared build` (shared must build first), then `… extension build` / `… pwa build`.
- All: `pnpm -r test` / `pnpm build`.
- **PWA build/dev needs `packages/pwa/.env`** with `PUBLIC_*` vars (see root `.env.example`) — without it the build fails on `$env/static/public`.

## Conventions & working style

- **Branch** off `main`; PRs squash-merge (leaves branches "ahead 1/behind 1" — delete after). Feature work not on `main`.
- **Commit/merge/push only when asked.** Don't nag about merging; the human says when a feature's done. Manual testing takes as many turns as it takes — a green build is not a cue to wrap up.
- Commit messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`; PR bodies end with the Claude Code footer.
- The human works iteratively and expects rigor — verify claims against code/tests, don't paper over failures.
- Output style is terse/impersonal ("Disciplined"): momentum on short cues, bounded options for decisions, OBSERVED vs UNKNOWN kept distinct.

---

## Landmines / gotchas before touching code

- **pnpm toolchain drift (hard prerequisite).** Lockfile written by pnpm 10.33.4; machine default is now 11.1.2; no `packageManager` pin. Frozen install fails: `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH` on the `pnpm.overrides` block; bare `pnpm -r test` aborts with `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`. Fix ONE way: (a) `pnpm install` non-frozen under 11 → **commit the regenerated lockfile**; (b) pin `"packageManager": "pnpm@10.33.4"`; (c) reinstall pnpm 10. Do this as its own commit, separate from feature work.
- **Two pre-existing shared test failures on `main`** (not regressions): `tests/db/visits.test.ts` (same-ms `updatedAt`) and `tests/sync/engine.test.ts` (`navigator.onLine` undefined under Node). **Plan 1 fixes the engine one**; the visits one is left alone (out of scope). So after plan 1, only the visits failure should remain red.
- **Plan discoveries that deviate from the analysis — re-verify they still hold before coding:**
  - SW offline fix: nothing is prerendered (CSR-only, `ssr = false`), so `prerendered` is empty — the real fix is an explicit `"/index.html"` precache entry. (Plan 2 Task 1.)
  - Both `ImportDialog.svelte` files are **dead code** — neither app imports them; each `TrailList` inlines its own import flow. Plan 4 phase 1 ships a shared `ImportDialog` and *adopts* it in both TrailLists (not a pure move). (Plan 4 Task 2/3.)
  - Bulk mark-Synced deliberately **stops re-stamping `updatedAt`** — behavior change, framed as a fix in spec 1 §2. Watch the engine tests expect this.
- **Shared UI is phased.** The on-disk plan `2026-07-13-shared-ui-package.md` is **phase 1 only** (scaffold + ImportDialog + VisitCard). TrailList/TrailDetail extraction is a **phase-2 plan to be written after items 1-3 land** — because the liveQuery work (item 3) rewrites the PWA sides those extractions target. Don't extract them from stale sources.
- **Plan ordering dependency:** the PWA vitest harness is created inside plan 2 (SW registration tests) / plan 3 (query tests). If you execute plan 3 before plan 2, copy the harness-setup step (plan 2, Task 3 Step 1) first.

---

## History — finished this session (skip unless relevant)

- Turned the prior analysis into `docs/ROADMAP.md` + 4 specs + 4 plans. Scope confirmed with the human (all 4, in order); two design forks decided (silent SW auto-reload not a prompt; shared UI in a new `packages/ui`).
- Commits on `docs/roadmap-and-specs-2026-07-13`: `e4400f9` (roadmap + specs), `46ffbb3` (plans + roadmap links). Both pushed.
- A separate `docs/handoff-2026-07-13` branch exists from the *previous* session (the handoff that kicked off this one) — unrelated, can be ignored/cleaned up.
- Prior history (codebase analysis `59e3d53`, Dependabot resolution PR #66 `5bf71ca`) is in git; don't restate.
