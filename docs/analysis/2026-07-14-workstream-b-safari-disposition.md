# Workstream B (Safari branch) — Disposition Analysis

**Date:** 2026-07-14
**Purpose:** Durable record of what the `safari` branch actually contains, so a final disposition of workstream B can be made deliberately rather than from the "it's just the Safari port" framing (which is inaccurate). Produced during the branch-cleanup session that consolidated workstream A onto `dev`.

## TL;DR

`safari` is **not** one thing. It is three separable bodies of work, and only one of them is genuinely Safari-specific:

1. **Offscreen-document removal** — a cross-browser architecture change (also simplifies Chrome). → tracked in **#39** (reopened), plan drafted on `dev` (`docs/superpowers/plans/2026-07-14-remove-offscreen-document.md`).
2. **Capture & permissions rearchitecture** — content-script-driven capture + `host_permissions`/`tabs`/`webNavigation` removal + tab-reuse tracking + forced light mode. **Cross-browser behavior changes** bundled with the Safari port; they change Chrome too. → tracked in **#60**.
3. **Genuinely Safari-only shims** — tab-based OAuth fallback, `transitionType`/`chrome.windows` gating, popup permission-denial handling, `build-safari.sh`. → umbrella **#54** (with #40, #43 closed-but-unmerged).

The decisive structural fact: **there is a single shared `manifest.json`, `build-safari.sh` does not fork it, and the source has almost no runtime browser-gating.** So most Safari-era changes were applied to the shared codebase and ship to Chrome as well — they are not sandboxed to Safari.

## Branch topology (as of 2026-07-14)

- `safari` (`3dd01c5`) — the **substantive head** of workstream B. Parked, unmerged.
- The old `dev` (Safari integration checkpoint) has been **deleted**; its only content beyond `safari` was `.claude/` housekeeping + `CLAUDE.md` (copied elsewhere by the operator before deletion).
- `safari` was ahead of the old `dev` by 8 real commits (the newest Safari feature work); the old `dev` was ahead of `safari` only by 3 `.claude` housekeeping commits. So `safari` — not the deleted `dev` — is the branch that holds the substantive workstream-B work.
- Fork point from `main`: `1977727` (2026-04-11). `safari` carries ~48 commits since then; `main` moved forward independently (Dependabot/security + the optimization-analysis report that seeded workstream A).

## Chronology — offscreen removal was the *opening move* of the Safari port

Oldest-first on the divergent line:

1. `4d5788d` — a single docs commit adding **all three** planning docs at once: `safari-extension-research.md`, `mobile-capture-research.md`, and `2026-04-10-remove-offscreen.md`.
2. `c216e43 → 2b131bb` — the first code: chrome.storage adapter, extract data/auth/sync layers out of the offscreen handler, then "remove offscreen document."
3. `2fdef89 …` onward — only *then* the explicitly Safari-platform commits (missing `transitionType`, tab-based OAuth, `build-safari.sh`, dark mode, content-script capture).

So offscreen removal is the architectural prerequisite the Safari plan opens with — not a separate earlier cleanup, and not Safari-only in effect.

## Rationale behind the offscreen refactor (pile 1)

From the plan's own Goal/Architecture and `safari-extension-research.md`:

- **Primary — Safari cannot use `chrome.offscreen`.** The offscreen document existed only because an MV3 service worker has no DOM/`localStorage`, and Supabase defaults to `localStorage` for session persistence. The sole blocker was solved with a custom `chrome.storage.local` storage adapter passed into `createSupabaseClient`, letting Supabase run directly in the SW.
- **Secondary — architecture simplification, applied to Chrome too.** Collapses `background SW → sendToOffscreen envelope → offscreen document → IndexedDB/Supabase` into direct calls; deletes the offscreen-document lifecycle and the `sendToOffscreen` pattern.
- **Cost absorbed:** running Supabase auth in the SW surfaced "auth lost after SW restart," fixed with `ensureSessionRecovered()`; and "sync timestamp not updating," fixed by writing `lastSyncTime` to `chrome.storage.local` directly instead of a `syncComplete` self-message (a SW does not deliver `runtime.sendMessage` to its own listener). **These two fixes are folded into the #39 plan** so a re-derivation onto `dev` does not reintroduce them.

## Per-item: is it actually Safari-specific?

| Item | Safari-only? | Evidence |
|---|---|---|
| Offscreen-document removal | **No — cross-browser** | Simplifies Chrome too; new `data-layer`/`auth-layer`/`sync-layer`/`supabase-storage` replace the offscreen tree on both builds. |
| Content-script-driven capture | **No — cross-browser** | `content/index.ts`: "replaces `webNavigation.onCommitted`" → sends `pageVisited`. Ungated; the manifest drops `webNavigation`, so `onCommitted` cannot fire on Chrome either. |
| `host_permissions` / `tabs` / `webNavigation` removal | **No — cross-browser** | Single shared manifest → `permissions: ["storage","alarms","identity"]`, no `host_permissions`. Chrome loses them too. |
| Tab-reuse tracking | **No — cross-browser** | Commit `3dd01c5` "cross-browser tab reuse"; `b05f32a` "without tabs permission." Applied universally. |
| Forced light mode | **No — cross-browser** | Hard-coded `color-scheme: light` + `<meta>` in `history/`, `options/`, `popup/` index.html. Forces light on Chrome dark-mode users. (Belongs to **#31** "Dark mode and high contrast," not the Safari port.) |
| `.env.example` | **No — neutral** | General onboarding file that merely also has a `SAFARI_*` section. |
| Tab-based OAuth fallback (`tab-auth.ts`) | **Effectively yes (portable)** | Runtime-gated: `hasIdentityApi = typeof chrome.identity !== "undefined"`. Chrome keeps `launchWebAuthFlow`; the tab path is dormant on Chrome. Additive. |
| `transitionType` / `chrome.windows` gating | **Effectively yes (dormant on Chrome)** | Defensive feature-detection; Chrome has both, so fallbacks never fire. |
| Popup permission-denial handling | **Mostly Safari-motivated** | Graceful-denial path; low Chrome impact. |
| `build-safari.sh` | **Yes — Safari-only** | Runs `safari-web-extension-converter` on `dist/`; touches nothing Chrome ships. |

## The consequential trade-off in pile 2 (for any Chrome-facing decision)

Moving to content-script capture **removes `transitionType`** on Chrome. On `main`, `transitionType` drives `inferSourceType`, `inferSourceDetail` ("typed URL"/"address bar"/"omnibox"/"bookmark"), `isExternalTransition`, and `isFromSearch` — which feed **trail auto-splitting** (`shouldStartNewTrail`). So adopting pile 2 as-is means **Chrome loses auto-split on address-bar/typed navigation** and loses those source labels. The Safari research doc acknowledges this and proposes only a partial mitigation (infer a new trail when no `linkClicked` preceded the load), which is not clearly implemented on `safari`.

- **Decoupling lever:** the *scary* permissions are `host_permissions` + `tabs` (install-time warnings). `webNavigation` is low-warning and is what supplies `transitionType`. A Chrome-optimal variant could keep `webNavigation` (retain auto-split) while shedding `host_permissions`+`tabs`.
- **UNKNOWN (needs a loaded-extension spike):** does `webNavigation.onCommitted` still deliver usable Wikipedia URLs with the `webNavigation` permission but **without** `host_permissions`? Chrome may redact URL details for non-permitted hosts. This one fact decides whether the decoupled path is viable. Not answerable from the repo.

## Issue map

| Issue | State | Maps to | Note |
|---|---|---|---|
| **#39** Remove offscreen document | OPEN (reopened 2026-07-14) | pile 1 | Was closed against unmerged `dev`/`safari`; re-derived plan now on `dev`. |
| **#60** Content-script-driven capture (remove host_permissions) | OPEN, labeled `cross-browser` | pile 2 | Bundles `webNavigation` removal; carries the `transitionType` regression + the spike above. Also flags a `pushState`/`popstate` content-script edge case. |
| **#54** Safari extension port (umbrella) | OPEN | pile 3 | Parent tracking issue. |
| **#40** Tab-based OAuth fallback | CLOSED | pile 3 | Closed against unmerged work. |
| **#43** Safari Xcode project/wrapper | CLOSED | pile 3 (`build-safari.sh`) | Closed against unmerged work. |
| **#44** Safari permission onboarding UX | OPEN | pile 3 | |
| **#45** iOS SW reliability testing | OPEN | pile 3 | |
| **#58** iOS storage volatility warning | OPEN | pile 3 | |
| **#31** Dark mode and high contrast | OPEN | (pile 2's forced-light-mode belongs here) | |

## File footprints (for scoping any extraction)

`safari` net diff vs `main`, offscreen + capture region:

- **Pile 1 (offscreen, clean):** new `background/{data-layer,auth-layer,sync-layer,supabase-storage}.ts`; deleted `src/offscreen/*` + `background/offscreen.ts`; `manifest.json` `"offscreen"` permission removed; `shared/sync/supabase-client.ts` gains an optional `storage` param (backward-compatible).
- **Pile 2/3 co-mingled in the same files:** `background/index.ts`, `background/capture.ts`, `background/auth-layer.ts`, `manifest.json` contain both the offscreen rewire *and* later Safari/capture edits; `background/tab-auth.ts` is pile-3-only. → You **cannot** lift a clean "offscreen-only" commit range from `safari` (history is duplicated + interleaved with `Merge safari into dev` commits). The #39 plan therefore **re-derives** pile 1 against `dev` rather than cherry-picking.

Disjointness with workstream A: pile 1 touches `background/` + `offscreen/` + `shared/sync`; workstream A's UI work touches `extension/src/history/*` and `packages/ui`. **No overlap** — pile 1 can proceed on `dev` without colliding with the shared-UI work. Plan-1 (`sync-write-path`, now on `dev`) touches `offscreen/sync-handler.ts` via `f45bc50` (uses `restampForUser`), so the #39 plan's `sync-layer` should call `restampForUser`.

## Open decisions for final disposition

1. **Pile 1 (offscreen removal):** execute the #39 plan off `dev` now (recommended — clean, no behavior change, aligns with the optimization analysis), or defer.
2. **Pile 2 (capture/permissions):** run the `webNavigation`-without-`host_permissions` spike; decide whether Chrome adopts the permission reduction (keeping `webNavigation`/auto-split) or the full content-script model. Exclude forced-light-mode (send to #31).
3. **Pile 3 (Safari-only):** keep parked on `safari` under #54 until there is intent to ship Safari; nothing here benefits Chrome.
4. **`safari` branch itself:** keep as the parked head of workstream B. Do not delete — it is the only branch holding piles 2 and 3, and the reference implementation for pile 1's re-derivation.
