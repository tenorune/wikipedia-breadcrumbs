# Custom PWA Install Prompt — Design Spec

## Summary

Show a custom install prompt on the PWA home page after the user has demonstrated real engagement (signed in, synced, viewed a trail). The prompt adapts to platform: one-tap install on Android (Chrome/Edge), share instructions on iOS Safari. A dismissal lifecycle ensures the prompt isn't annoying while keeping install accessible via a header icon.

## Motivation

The browser's default install banner is unreliable and poorly timed. A custom prompt shown after meaningful engagement converts better and respects the user's attention.

## Trigger Conditions

The install prompt shows when ALL of these are true:

- **Signed in:** `authState.isAuthenticated` is true
- **Has synced:** `lastSyncTime` exists in localStorage
- **Has viewed a trail:** `hasViewedTrail` is `"true"` in localStorage
- **Not already installed:** `window.matchMedia('(display-mode: standalone)').matches` is false
- **Platform eligible:** `beforeinstallprompt` event has fired (Android/Chrome/Edge) OR iOS Safari detected

If any condition is not met, no prompt is shown and no header icon appears.

## Platform Detection

- **Android (Chrome/Edge/Samsung):** The `beforeinstallprompt` event fires. Capture and store the deferred prompt event in the layout. The install button calls `deferredPrompt.prompt()`.
- **iOS Safari:** Detected via user agent (`/iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream && /Safari/.test(navigator.userAgent)`). No `beforeinstallprompt` available. The prompt shows instructions instead. Note: iOS Chrome (`CriOS`) and iOS Firefox (`FxiOS`) cannot install PWAs and are intentionally excluded by this check.
- **Already installed:** `window.matchMedia('(display-mode: standalone)').matches` returns true. Hide all install UI.
- **Unsupported browsers (Firefox, desktop, etc.):** Neither `beforeinstallprompt` fires nor iOS detected. No install UI shown.

## Dismissal Lifecycle

Two states, tracked in localStorage key `installPromptState`:

| State | Home page behavior | Header icon |
|-------|-------------------|-------------|
| `"eligible"` (default/absent) | Full inline prompt visible | No icon |
| `"dismissed"` | No inline prompt | Download icon visible; tap reopens full prompt |

- Dismissing the prompt sets `installPromptState` to `"dismissed"`.
- Tapping the header icon shows the full inline prompt again (does not reset the state — icon remains permanently until install).
- Successfully installing the app hides everything (detected via `standalone` display mode on next load, or via `appinstalled` event immediately on Android). On iOS, there is no `appinstalled` event — the prompt hides on next app load when `standalone` mode is detected.
- Sign-out does not reset the dismissal state. The user's install preference persists across sessions.

## Engagement Tracking

**New localStorage key:**
- `hasViewedTrail` — set to `"true"` when the user navigates to a trail detail view

**Set in:** The PWA trail detail page (`packages/pwa/src/routes/trails/[id]/+page.svelte` or equivalent trail detail component). Set once on mount if not already set.

**Existing state used:**
- `authState.isAuthenticated` — from `$lib/stores/auth.svelte`
- `lastSyncTime` — already in localStorage
- `beforeinstallprompt` event — captured in layout

## Install Prompt UI

### Full Inline Prompt

Appears on the home page, inline with content. Styled as a card matching the `settings-card` pattern (`#f8f9fa` background, `border-radius: 10px`, padding).

**Content:**
- Text: "Install Wikipedia Breadcrumbs for quick access from your home screen"
- **Android:** "Install" button (primary style, calls `deferredPrompt.prompt()`)
- **iOS:** "How to install" button that expands to show: "Tap the share icon then 'Add to Home Screen'" (with the iOS share icon &#x2191; rendered inline)
- Dismiss "X" button in the top-right corner (sets `installPromptState` to `"dismissed"`)

### Header Icon (after dismissal)

- Lucide `download` icon in the home page header
- Tapping it shows the full inline prompt again
- Only visible when `installPromptState` is `"dismissed"` AND platform is eligible AND not installed

## Architecture

### Files

**Create:**
- `packages/pwa/src/lib/components/InstallPrompt.svelte` — the inline prompt card component
- `packages/pwa/src/lib/stores/install.svelte.ts` — captures `beforeinstallprompt`, tracks platform eligibility, manages prompt state

**Modify:**
- `packages/pwa/src/routes/+layout.svelte` — initialize install store (capture `beforeinstallprompt` early)
- Home page component — render `InstallPrompt` and header icon conditionally
- Trail detail component — set `hasViewedTrail` on mount

### Install Store (`install.svelte.ts`)

Exports:
- `installState` — reactive object with `{ eligible: boolean, platform: "android" | "ios" | null, dismissed: boolean, installed: boolean }`
- `dismissInstallPrompt()` — sets dismissed state
- `triggerInstall()` — calls `deferredPrompt.prompt()` on Android (no-op on iOS)

The store is self-contained and reactive. It:
- Listens for `beforeinstallprompt` on window, stores deferred event. If the event fires after mount, the store reactively updates `eligible` — the prompt appears when conditions are met regardless of event timing.
- Listens for `appinstalled` on window (Android only)
- Reads/writes `installPromptState` from localStorage
- Detects iOS Safari via user agent
- Checks `display-mode: standalone` media query
- Reads `authState`, `lastSyncTime`, and `hasViewedTrail` reactively — no manual `checkEligibility` call needed. Consumers just read `installState.eligible`.

## Scope

**In scope:**
- Custom install prompt on PWA home page
- Android native install via `beforeinstallprompt`
- iOS Safari manual install instructions
- Dismissal lifecycle with header icon fallback
- Engagement tracking (`hasViewedTrail`)

**Out of scope:**
- Desktop install prompt (PWA is targeting mobile for now)
- Firefox/other browser install support
- Analytics/tracking of install rates
- A/B testing prompt variations
