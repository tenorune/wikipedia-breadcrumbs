# PWA + Auth — Design Spec

**Date:** 2026-03-31
**Status:** Draft
**Parent spec:** `2026-03-30-wikipedia-breadcrumbs-design.md`
**Scope:** SvelteKit PWA with offline support, Supabase sync, Google OAuth + email/password auth, extension auth integration.

---

## Overview

A Progressive Web App for viewing and managing Wikipedia breadcrumb trails. Built with SvelteKit as a static client-side app. Data is stored locally in IndexedDB (offline-first) and synced to Supabase. Auth enables cross-device sync between the PWA and the Chrome extension.

Anonymous-first: the app works without sign-in. Users discover auth via Home or Settings when they want cross-device sync.

**Dependencies:** `@wikipedia-breadcrumbs/shared` (models, db, sync, citations), `@supabase/supabase-js`, SvelteKit, `@sveltejs/adapter-static`

---

## Architecture

### Stack

| Layer | Technology |
|-------|-----------|
| Framework | SvelteKit (static adapter, no SSR) |
| UI | Svelte 5 with runes |
| Local storage | IndexedDB via Dexie.js (shared lib) |
| Remote | Supabase (via shared sync engine) |
| Auth | Supabase Auth (Google OAuth, email/password) |
| Offline | Service worker (app shell caching) |
| Build | Vite |

### Package Structure

```text
packages/pwa/
├── src/
│   ├── routes/
│   │   ├── +layout.svelte          # Bottom tab bar, auth state, sync init
│   │   ├── +layout.ts              # Client-side only (ssr: false)
│   │   ├── +page.svelte            # Home — recent trails, stats
│   │   ├── trails/
│   │   │   ├── +page.svelte        # Trail list with search/sort
│   │   │   └── [id]/
│   │   │       └── +page.svelte    # Trail detail
│   │   └── settings/
│   │       └── +page.svelte        # Auth, sync, preferences
│   ├── lib/
│   │   ├── stores/
│   │   │   ├── auth.ts             # Auth state store (wraps supabase.auth)
│   │   │   ├── sync.ts             # Sync state store (engine, status, triggers)
│   │   │   └── db.ts               # Shared DB instance
│   │   ├── components/
│   │   │   ├── TabBar.svelte       # Bottom tab navigation
│   │   │   ├── TrailList.svelte    # Trail list with search/sort/star/delete
│   │   │   ├── TrailDetail.svelte  # Trail header, visit timeline, split/merge
│   │   │   ├── VisitCard.svelte    # Visit display with timestamps, notes, cite
│   │   │   ├── AuthForm.svelte     # Google + email/password sign-in
│   │   │   └── SyncStatus.svelte   # Sync toggle, sync now, last synced
│   │   └── supabase.ts            # Supabase client singleton
│   ├── service-worker.ts          # App shell caching
│   └── app.html                   # SvelteKit app template
├── static/
│   ├── manifest.webmanifest
│   ├── icons/                     # PWA icons
│   └── favicon.png
├── package.json
├── svelte.config.js
├── vite.config.ts
└── tsconfig.json
```

### No SSR

All pages render client-side only. The `+layout.ts` exports `ssr = false`. SvelteKit's static adapter generates a single-page app. This simplifies deployment and means every page has full access to IndexedDB and the Supabase client.

---

## Routes

### Home (`/`)

Landing page showing:
- App title
- Quick stats: total trails, total pages visited
- Recent trails (top 5 by `updatedAt`)
- Each trail links to `/trails/[id]`
- "Sign in" link (if not authenticated) — navigates to `/settings`
- Last synced time (if sync enabled)

### Trails (`/trails`)

Full trail browser:
- Search box (filters by trail name, first/last title)
- Sort: Most Recent (`updatedAt`), Oldest (`startedAt`), Starred First
- Trail list items show: name (or first→last title), page count, date, active badge, star toggle, delete button
- Click trail → `/trails/[id]`

### Trail Detail (`/trails/[id]`)

Single trail view:
- Trail header: name (editable inline), star toggle, merge button
- Trail meta: page count, date range, active badge
- Trail note (editable)
- Sort toggle: Discovery / Visited, ascending/descending (persisted to localStorage)
- Visit cards in sorted order
- Split button between visits (discovery ascending only)
- Merge: button opens a picker listing other trails (by name or first→last title), same UX as extension

**Visit cards show:**
- Article title (links to Wikipedia in new tab)
- Discovered timestamp, last-visited timestamp (when different)
- Note (inline editable)
- Cite button (format picker: Wikipedia, APA, MLA, Chicago, BibTeX, Markdown, URL)
- Delete button
- Split button (when applicable)

### Settings (`/settings`)

- **Auth section:** "Sign in with Google" button, email/password form, "Sign out" button (when authenticated), user display (email or "Anonymous")
- **Sync section:** sync toggle, sync now button, last synced time, device ID
- **Preferences:** (minimal for now — placeholder for future settings)

### Device ID

Generated as `crypto.randomUUID()` on first app load. Stored in `localStorage` under key `deviceId`. Passed to `createTrail()`. If `localStorage` is cleared, a new device ID is generated — treated as a new device (consistent with extension behavior).

### Email Confirmation

Supabase's default email auth requires email verification. For Phase 2, disable email confirmation in the Supabase dashboard (Authentication → Settings → Email → toggle off "Enable email confirmations") to simplify the flow. Users can sign in immediately after sign-up. Email confirmation can be re-enabled later.

---

## Auth

### Providers

- **Google OAuth** — configured in Supabase dashboard, redirect-based flow
- **Email/password** — Supabase's built-in email auth

### Flow

1. User visits Settings and taps "Sign in with Google" or fills email/password
2. **Google:** `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin + '/settings' } })` — redirects to Google, comes back to `/settings`
3. **Email/password:** `supabase.auth.signUp()` or `supabase.auth.signInWithPassword()`
4. Auth state change fires → `auth` store updates → UI reacts
5. If user was previously anonymous, upgrade flow runs (see below)

### Anonymous → Authenticated Upgrade

When a signed-in user had previous anonymous data:

1. Get the new `user_id` from the authenticated session
2. Query all local trails — update `user_id` to the new value, mark `pending_sync`
3. Query all local visits — mark `pending_sync`
4. Run sync — pushes local data under the new account
5. Pull merges any existing remote data:
   - Trails matched by `device_id` + `started_at` = same trail (no duplicates)
   - Unmatched trails kept from both sources

### Auth State Store

```typescript
// src/lib/stores/auth.ts
import type { User } from '@supabase/supabase-js';

// Svelte 5 module-level state (runes). Imported as `authStore` in components.
let user = $state<User | null>(null);
let isAuthenticated = $state(false);

export const authStore = {
  get user() { return user; },
  get isAuthenticated() { return isAuthenticated; },
  set(u: User | null) { user = u; isAuthenticated = u !== null; },
};
```

Updated via `supabase.auth.onAuthStateChange()` in the root layout.

### Session Persistence

Supabase JS persists the session in `localStorage` by default. The PWA's same-origin `localStorage` survives across browser → installed PWA transition.

---

## Sync

Reuses the shared lib's `SyncEngine` and `SupabaseBackend`.

### Supabase Client

```typescript
// src/lib/supabase.ts
import { createSupabaseClient } from '@wikipedia-breadcrumbs/shared';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

export const supabase = createSupabaseClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);
```

### Sync State Store

```typescript
// src/lib/stores/sync.ts
let syncEnabled = $state(false);
let lastSyncTime = $state<string | null>(null);
let syncing = $state(false);

export const syncStore = {
  get syncEnabled() { return syncEnabled; },
  set syncEnabled(v: boolean) { syncEnabled = v; },
  get lastSyncTime() { return lastSyncTime; },
  set lastSyncTime(v: string | null) { lastSyncTime = v; },
  get syncing() { return syncing; },
  set syncing(v: boolean) { syncing = v; },
};
```

### SyncStateStore Implementation

Uses `localStorage` (the PWA has direct access — unlike the extension which uses an in-memory store in the offscreen document with a `syncComplete` message to the background for persistence):

```typescript
const stateStore: SyncStateStore = {
  async getLastSyncTime() {
    return localStorage.getItem('lastSyncTime');
  },
  async setLastSyncTime(time: string) {
    localStorage.setItem('lastSyncTime', time);
    lastSyncTime.set(time);
  },
};
```

### Sync Triggers

- **On page load:** if sync is enabled and user is authenticated, sync once
- **Periodic:** `setInterval` every 5 minutes while the tab is visible
- **Manual:** "Sync now" button in Settings
- **On auth state change:** sync immediately after sign-in or upgrade

### User ID Stamping

Same logic as the extension: on first sync enable (or after auth upgrade), all local trails with mismatched or null `user_id` get stamped with the current user's ID and marked `pending_sync`.

---

## Extension Auth Integration

The extension's Options page gets auth capabilities too, so users can sign in from either the extension or PWA.

### Changes to Extension

**Options page (`SettingsForm.svelte`):**
- New "Account" section above sync toggle
- "Sign in with Google" button + email/password form
- When signed in: shows email, "Sign out" button
- Sign-in/sign-out happens in the offscreen document (has localStorage for Supabase session)

**Offscreen sync handler:**
- New message types: `signInWithGoogle`, `signInWithPassword`, `signUp`, `signOut`, `getAuthStatus`
- Google OAuth in an extension uses `chrome.identity.launchWebAuthFlow()` instead of redirect — the offscreen handler gets the OAuth token and exchanges it with Supabase via `supabase.auth.signInWithIdToken()`
- Email/password auth goes directly through Supabase JS

**Messaging types:**
- Add auth message types to `OffscreenRequest` and `BackgroundMessage`

### Google OAuth in Extension

Chrome extensions can't use redirect-based OAuth. Instead they use `chrome.identity`:

1. Extension calls `chrome.identity.launchWebAuthFlow({ url: googleAuthUrl, interactive: true })` using the implicit grant flow to get an ID token
2. Google returns the ID token to the extension's redirect URL (`https://<extension-id>.chromiumapp.org/`)
3. Extension calls `supabase.auth.signInWithIdToken({ provider: 'google', token: idToken })` to exchange the ID token for a Supabase session

**Manifest change required:** Add `"identity"` to the `permissions` array in `manifest.json`.

This requires registering the extension's redirect URL in the Google Cloud Console OAuth credentials and configuring the Google provider in Supabase Auth settings.

---

## Layout

### Bottom Tab Bar

Fixed at the bottom of the viewport. Four tabs:

| Tab | Icon | Route |
|-----|------|-------|
| Home | 🏠 | `/` |
| Trails | 📋 | `/trails` |
| Settings | ⚙️ | `/settings` |

Content area scrolls above the tab bar.

Active tab is visually highlighted. Navigation uses SvelteKit's `goto()` or `<a>` tags.

### Responsive

The PWA is mobile-first with the bottom tab bar. On larger screens (>768px), the tab bar could optionally move to a top/side position, but for Phase 2 the bottom bar works at all sizes. Refinement deferred.

---

## Service Worker

SvelteKit's built-in service worker support.

**`src/service-worker.ts`:**
- Precaches the app shell (build output — HTML, JS, CSS)
- Uses `workbox`-style strategies or SvelteKit's `$service-worker` module
- Static assets: cache-first
- Navigation requests: network-first with cache fallback
- API calls (Supabase): network-only (data is in IndexedDB)

The service worker ensures the app loads when offline. Data is always local-first via IndexedDB.

---

## Web App Manifest

```json
{
  "name": "Wikipedia Breadcrumbs",
  "short_name": "Breadcrumbs",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#0066cc",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

---

## Environment Variables

The PWA uses SvelteKit's public env vars (accessible in client code):

- `PUBLIC_SUPABASE_URL` — Supabase project URL (SvelteKit requires `PUBLIC_` prefix)
- `PUBLIC_SUPABASE_ANON_KEY` — Supabase anon key
- `PUBLIC_GOOGLE_CLIENT_ID` — Google OAuth client ID (for extension auth flow)

Note: The extension uses `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (Vite convention). The PWA uses `PUBLIC_SUPABASE_*` (SvelteKit convention). Both read from the same `.env` file — it needs both sets of variables. The `.env.example` will be updated.

---

## Supabase Setup Additions

The setup guide (`docs/setup/supabase-setup.md`) needs updates for:

1. **Enable Google OAuth provider** in Supabase dashboard → Authentication → Providers → Google
2. **Google Cloud Console setup** — create OAuth 2.0 credentials, configure consent screen, get client ID + secret
3. **Redirect URLs** — add PWA's URL and extension's redirect URL to Google OAuth config
4. **Email auth** — already enabled by default in Supabase

These instructions will be added to the gitignored setup guide.

---

## What's Deferred

| Feature | Phase |
|---------|-------|
| `/add` route (manual capture) | Backlog |
| `/shared/[id]` (public trail viewer) | Backlog |
| Share target (receive URLs from mobile) | Backlog |
| Wikimedia OAuth | Backlog |
| SSR for shared trails | Backlog |
| Custom install prompt | Backlog |
| Responsive sidebar layout for desktop | Backlog |
