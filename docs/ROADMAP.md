# Roadmap

Forward-only. Shipped work is not listed here — it lives in git history on `dev`, with
its design specs under `docs/superpowers/specs/` and implementation plans under
`docs/superpowers/plans/`. Origin: the 2026-07-12 codebase analysis
(`docs/analysis/2026-07-12-optimization-and-feature-analysis.html`).

**Shipped and consolidated on `dev`** (see specs/plans + git): the four accepted
optimization items — sync write path, service-worker offline + silent-update, PWA Dexie
`liveQuery`, and shared `packages/ui` phase 1 (ImportDialog + VisitCard) — plus **#39
remove-offscreen-document** (the extension service worker now runs Dexie + Supabase
directly via a `chrome.storage.local` session adapter; manifest dropped only the
`offscreen` permission). #39's only remaining step is the operator manual smoke test
(auth across SW restart, sync timestamp) with real Supabase creds.

## Next

| Item | Spec / Plan | Issue | Status |
|------|-------------|-------|--------|
| **Shared UI phase 2** — extract `TrailList` + `TrailDetail` into `packages/ui` as presentational components (data/db/nav injected via props/callbacks; PWA styling canon) | [plan](superpowers/plans/2026-07-14-shared-ui-phase-2.md) · [spec](superpowers/specs/2026-07-13-shared-ui-package-design.md) | — | **Plan written, ready to execute** off `dev` (subagent-driven, 8 tasks). |

## Workstream B (Safari) — parked

The `safari` branch is not "just the Safari port"; it decomposes into three piles, only
one of which is Safari-specific. Full analysis and disposition options:
`docs/analysis/2026-07-14-workstream-b-safari-disposition.md`.

- Pile 1 (offscreen removal) → the #39 item above (re-derived onto `dev`).
- Pile 2 (content-script capture + `host_permissions`/`tabs` removal) → **#60**; carries a
  `transitionType`/auto-split regression on Chrome and an open spike (does `webNavigation`
  work without `host_permissions`?).
- Pile 3 (Safari-only shims: tab OAuth, `build-safari.sh`, etc.) → umbrella **#54**; keep
  parked until there is intent to ship Safari.

## Explicitly excluded (do not spec)

- PWA `/add` manual-capture route (analysis UX #7)
- Mobile share target (analysis UX #8)
