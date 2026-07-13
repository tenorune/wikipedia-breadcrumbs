# Roadmap

Derived from the 2026-07-12 codebase analysis
(`docs/analysis/2026-07-12-optimization-and-feature-analysis.html`); scope confirmed
2026-07-13. Each item has a design spec under `docs/superpowers/specs/` and gets an
implementation plan under `docs/superpowers/plans/` before work starts.

## Accepted sequence

| # | Item | Analysis refs | Spec | Status |
|---|------|--------------|------|--------|
| 1 | Sync write path: batch upserts + bulk local writes, `syncNow()` guard, surface sync errors in UI | opt #1, opt #5, UX #1 | [2026-07-13-sync-write-path-design.md](superpowers/specs/2026-07-13-sync-write-path-design.md) | Spec written |
| 2 | Service worker: fix offline fallback + silent auto-update flow | opt #4, UX #5 | [2026-07-13-service-worker-offline-update-design.md](superpowers/specs/2026-07-13-service-worker-offline-update-design.md) | Spec written |
| 3 | Adopt Dexie `liveQuery` in the PWA (kills N+1 loads and reload-after-mutation) | opt #2 | [2026-07-13-pwa-livequery-design.md](superpowers/specs/2026-07-13-pwa-livequery-design.md) | Spec written |
| 4 | Extract shared UI components into `packages/ui` (ImportDialog → VisitCard → TrailList/TrailDetail) | opt #3 | [2026-07-13-shared-ui-package-design.md](superpowers/specs/2026-07-13-shared-ui-package-design.md) | Spec written |

## Sequencing rationale

1. **Sync write path first** — smallest surface, immediate correctness/UX payoff
   (failed syncs are currently invisible), and it touches the shared engine that both
   apps use.
2. **Service worker second** — self-contained in the PWA; fixes a real offline bug and
   ends the stale-bundle problem. No dependency on the other items.
3. **liveQuery third** — reshapes how the PWA's three data views load data. Doing this
   *before* UI extraction means the extracted components can be designed as
   presentational (data in via props) rather than owning loads.
4. **Shared UI last** — the largest item; depends on item 3 having settled the PWA
   side, and its pilot (ImportDialog) proves the new package wiring before the bigger
   components move.

## Decisions locked during scoping (2026-07-13)

- App update UX: **silent auto-reload** (skipWaiting + one guarded reload on
  `controllerchange`), per the proven pattern in
  [tenorune/on pwa-auto-update.md](https://github.com/tenorune/on/blob/main/docs/pwa-auto-update.md)
  — not an update prompt.
- Shared UI lives in a **new `packages/ui` workspace package** shipping raw `.svelte`
  files (no build step); `packages/shared` stays pure TS.

## Explicitly excluded (do not spec)

- PWA `/add` manual-capture route (analysis UX #7)
- Mobile share target (analysis UX #8)

## Chores (not roadmap items, do before touching code)

- **pnpm toolchain drift**: lockfile written by pnpm 10.33.4, machine default is now
  11.1.2, no `packageManager` pin — frozen installs fail on the `pnpm.overrides`
  block. Reconcile (regenerate lockfile under pnpm 11 and commit, or pin
  `packageManager`) before the first implementation session.
- **Two env-dependent shared test failures on main** (pre-existing):
  `tests/db/visits.test.ts` same-millisecond `updatedAt` comparison, and
  `tests/sync/engine.test.ts` `navigator.onLine` undefined under Node. The engine one
  is fixed as part of item 1 (spec includes it); the visits one is a trivial
  standalone fix.
