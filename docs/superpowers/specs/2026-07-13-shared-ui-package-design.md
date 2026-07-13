# Shared UI Package (`packages/ui`) — Design Spec

## Summary

Create `@wikipedia-breadcrumbs/ui`, a new workspace package of shared Svelte 5
components consumed by both the extension and the PWA, and migrate the duplicated
components into it in order: **ImportDialog → VisitCard → TrailList → TrailDetail**.
Platform differences (navigation, device-id, data loading) are injected via props and
callbacks. Covers analysis opt #3. Decided during scoping: a new package, not a
subpath of `packages/shared`, which stays pure TS.

## Motivation

Four component pairs are maintained twice (extension / PWA line counts):

| Component | Ext | PWA | Overlap |
|---|---|---|---|
| ImportDialog | 127 | 130 | ~99% — script blocks are character-identical |
| VisitCard | 276 | 345 | ~70% |
| TrailList | 335 | 447 | ~75% |
| TrailDetail | 532 | 659 | ~80% |

Fixes and features must land twice and have already drifted (time formatting, note
cancel, hover states). ui-ux-guidelines says both platforms are one product; shared
components make that structural.

## Package design

- `packages/ui/package.json`:
  - name `@wikipedia-breadcrumbs/ui`, `"svelte"` export condition per component
    (`"./ImportDialog.svelte"`-style subpath exports plus an index re-export);
  - **no build step** — raw `.svelte` files ship as-is; each app's
    `vite-plugin-svelte` / SvelteKit toolchain compiles them (both apps are already on
    identical Svelte `^5.55.7` / Vite `^6.4.3`);
  - `peerDependencies`: `svelte ^5`; `dependencies`:
    `@wikipedia-breadcrumbs/shared workspace:*`;
  - dev: `svelte-check` + a tsconfig for type-checking in CI (`pnpm --filter ui check`).
- Both apps add `"@wikipedia-breadcrumbs/ui": "workspace:*"`.
- Dependency direction: `ui → shared` only. `shared` gains no Svelte tooling.

## Design rule: presentational components

Shared components own no data loading and no platform APIs. Data enters via props;
platform behavior enters via callbacks. The PWA feeds them from liveQuery
(per the 2026-07-13 pwa-livequery spec), the extension from its existing `refresh()`
flow. Consequence: **TrailList/TrailDetail extraction happens after the liveQuery
work has landed** — their PWA call sites are rewritten there anyway.

Injected seams (union of what the two apps need today):

- **DB**: a `BreadcrumbsDB` instance as a prop (extension currently instantiates
  inside components; PWA imports a singleton — both become "pass it in").
- **Device id**: `getDeviceId: () => Promise<string>`. Unified on async; the PWA's
  sync localStorage version is wrapped, the extension's chrome.storage version already
  matches.
- **Navigation**: default rendering is a plain `<a href target="_blank">`; an optional
  `onNavigate(visit, url)` callback intercepts (preventDefault) — the extension wires
  its `navigateActiveTrail` / `resumeTrailInNewTab` runtime messages there, the PWA
  omits it. Trail selection stays a callback (`onSelectTrail`), which the PWA
  implements with `goto()`.
- **Trail context on VisitCard**: `trailId` / `trailStatus` / `onResumed` become
  optional props (extension passes them; PWA doesn't).

## Component contracts

### ImportDialog (pilot)

Props: `{ db, getDeviceId, onImported?: () => void }`. Everything else is already
identical. The pilot's job is proving the package wiring end to end (exports map,
both bundlers, type-check, tests) on the lowest-risk component.

### VisitCard

Props: `{ visit, onUpdateNote, onDelete, onSplit?, onNavigate?, trailId?, trailStatus?, onResumed? }`.
Canonicalizations while merging the two bodies:

- Time formatting: adopt the PWA's smarter formatter, checked against
  `docs/design/time-display.md`.
- Note editing: PWA behavior (save on blur/input, plus `cancelNote`).
- Cite menu: PWA's `positionCiteMenu()` positioning.

### TrailList

Presentational: receives precomputed trail summaries
(`{ trail, displayName, visitCount, lastVisitAt, isActive }[]`) plus
`onSelectTrail`, `onDeleteTrail`, and star-toggle callback. Embeds the shared
ImportDialog. Unified rendering shows the active badge and full meta in both apps
(truthful status display; today only the extension shows it).

### TrailDetail

Props: trail + visits data in, callbacks out (`onBack`, mutation callbacks that the
extension augments with its chrome messages). Sort preferences stay internal
(localStorage, same key scheme). The PWA-only title-wave animation is not shared: the
component accepts an optional `header` snippet; the PWA passes its animated title,
the default is a plain heading.

## Styling

One canonical scoped stylesheet per component. Current diffs are trivial (padding,
radius, hover states); the PWA variants are the more recent and become canonical
unless ui-ux-guidelines says otherwise for a given case. No design-token system yet —
CSS custom properties are introduced only if a concrete per-platform need survives
extraction (YAGNI).

## Rollout order

1. **ImportDialog** — proves the package; both apps switch, duplicates deleted.
2. **VisitCard** — prop-contract union; both apps switch.
3. **TrailList**, then **TrailDetail** — after liveQuery lands; PWA call sites feed
   summaries from queriers, extension from `refresh()`.

Each step lands independently: apps build, tests pass, duplicated file deleted in the
same change.

## Testing

- `svelte-check` on `packages/ui` in CI.
- Existing extension component tests move/point to the shared components where they
  cover extracted code (verify coverage shape during planning).
- Both apps build and their test suites pass at every rollout step.
- Manual pass per component on both platforms (visual parity, menus, note editing,
  import flow), per the project's hands-on verification workflow.

## Out of scope

- Design tokens, icon library, Storybook or visual-regression tooling.
- Extracting settings UI or InstallPrompt (not duplicated / platform-specific).
- Changing extension data loading to liveQuery.
- Behavior changes beyond the canonicalizations named above.
