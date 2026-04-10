# Safari Extension Port Research

## Goal

Understand what it would take to port the Chrome extension to Safari on macOS and iOS, enabling automatic Wikipedia trail capture on Apple platforms.

## Current Chrome Extension Architecture

The extension uses 8 Chrome API namespaces:

```
content script (Wikipedia pages) → background service worker → offscreen document (IndexedDB + Supabase)
```

The offscreen document exists because Chrome MV3 service workers lack `localStorage`, which Supabase JS needs for session persistence. All IndexedDB operations and Supabase auth/sync run in the offscreen document, with the background service worker communicating via `chrome.runtime.sendMessage`.

## API Compatibility

### Fully Supported (no changes needed)

| API | macOS Safari | iOS Safari | Usage in Extension |
|---|---|---|---|
| `chrome.alarms` | Yes (14+) | Yes (15+) | Periodic sync (5 min), idle trail finalization |
| `chrome.storage.local` | Yes (14+) | Yes (15+) | Settings, device ID |
| `chrome.runtime` (messaging, lifecycle) | Yes (14+) | Yes (15+) | Inter-component communication |
| `chrome.tabs` (query, get, create, update, events) | Yes (14+) | Yes (15+) | Tab management, trail navigation |

### Partially Supported (changes needed)

| API | Issue | Impact |
|---|---|---|
| `chrome.webNavigation.onCommitted` | Event fires, but **`transitionType` and `transitionQualifiers` are not populated** | Cannot distinguish link clicks, typed URLs, back/forward, redirects. Need alternative detection. |
| `chrome.windows` | Full support on macOS, **not supported on iOS** (no windowing concept) | Window focus/management code must be feature-gated for iOS. |

### Not Supported (blockers)

| API | Replacement Strategy |
|---|---|
| `chrome.offscreen` | Remove entirely — run IndexedDB and Supabase directly in the service worker using a custom `chrome.storage.local`-based storage adapter for Supabase session persistence |
| `chrome.identity` (`getRedirectURL`, `launchWebAuthFlow`) | Tab-based OAuth flow: open auth URL in a new tab, handle redirect via content script or extension page callback |

## Blocker 1: Removing the Offscreen Document

### Why it exists

The offscreen document hosts three things:
1. **IndexedDB** (via Dexie/`BreadcrumbsDB`) — trail and visit storage
2. **Supabase client** — auth (sign in, session management) and sync engine
3. **`localStorage`** — Supabase's default session persistence, unavailable in service workers

IndexedDB is accessible from service workers. Supabase's `fetch`-based operations don't need the DOM. The only real dependency is `localStorage` for Supabase session persistence.

### Fix: Custom Supabase storage adapter

Supabase JS supports a custom `auth.storage` option. Replace `localStorage` with `chrome.storage.local`:

```ts
createClient(url, key, {
  auth: {
    storage: {
      getItem: (key) => chrome.storage.local.get(key).then(r => r[key] ?? null),
      setItem: (key, value) => chrome.storage.local.set({ [key]: value }),
      removeItem: (key) => chrome.storage.local.remove(key),
    },
    persistSession: true,
    autoRefreshToken: true,
  },
});
```

### Impact on Chrome

**This change applies to the Chrome extension too.** Removing the offscreen document simplifies the architecture for both browsers:

**Before (Chrome-only):**
```
background SW → chrome.runtime.sendMessage → offscreen document → IndexedDB / Supabase
```

**After (cross-browser):**
```
background SW → IndexedDB / Supabase directly
```

Benefits:
- Eliminates all message-passing overhead for data operations
- Removes the offscreen document lifecycle management
- Single architecture for Chrome and Safari
- Simpler code — no `sendToOffscreen` envelope pattern

### Migration scope

- Delete `src/offscreen/` directory (handler.ts, auth-handler.ts, sync-handler.ts, index.ts)
- Delete offscreen HTML document
- Remove `"offscreen"` from manifest permissions
- Move `BreadcrumbsDB` instantiation into background service worker
- Move Supabase client creation into background service worker with custom storage adapter
- Move auth handler logic into background message handler (already partially there)
- Move sync engine into background service worker
- Update all `sendToOffscreen()` calls to direct function calls
- Update `createSupabaseClient` in shared package to accept a storage adapter parameter

## Blocker 2: OAuth Without `chrome.identity`

### Current flow (Chrome)

1. Options page calls `chrome.identity.getRedirectURL()` → `https://<extension-id>.chromiumapp.org/`
2. Constructs OAuth URL with that redirect URI
3. Calls `chrome.identity.launchWebAuthFlow()` → opens auth popup
4. Chrome handles the redirect back to the extension
5. Tokens extracted from callback URL

### Safari fallback: Tab-based OAuth

1. Open a new tab to the OAuth provider's authorization URL
2. Set the redirect URI to a Supabase Edge Function callback (already exists for Wikimedia) or an extension page
3. After auth, the Edge Function redirects with tokens in the URL fragment
4. An extension page (e.g., `auth-callback.html`) receives the redirect, extracts tokens, sends them to the background service worker via `chrome.runtime.sendMessage`, then closes itself

The existing Wikimedia OAuth Edge Function already handles the server-side token exchange — the extension just needs a different way to receive the callback.

### Preferred approach: Feature-detect and use both

Chrome's `launchWebAuthFlow` provides a more polished UX — a dedicated auth popup window that feels like a native sign-in dialog, handles the redirect internally, and closes itself. Tab-based OAuth works but briefly opens and closes a full browser tab, which is slightly less polished.

**Retain the popup UX on Chrome where possible**, falling back to tab-based on Safari:

```ts
if (chrome.identity?.launchWebAuthFlow) {
  // Chrome: dedicated auth popup window
  url = await launchWebAuthFlow(authUrl);
} else {
  // Safari: open tab, wait for callback message
  url = await launchTabAuthFlow(authUrl);
}
```

The token extraction, session setup, and everything downstream is shared. Only the delivery mechanism (~20-30 lines) is platform-specific. Low maintenance overhead for a noticeably better Chrome UX.

### Google OAuth consideration

Google OAuth currently uses `chrome.identity.launchWebAuthFlow` with `response_type=id_token`. For the tab-based fallback, the redirect URI would need to be a URL Google recognizes (not a `chrome-extension://` or `safari-web-extension://` URL). Options:
- Redirect through the Supabase Edge Function (like Wikimedia flow)
- Redirect to the PWA URL with a path that forwards tokens back to the extension
- Use Supabase's built-in Google OAuth provider

## Partial Support: Missing `transitionType`

### What's lost

The extension uses `transitionType` and `transitionQualifiers` from `webNavigation.onCommitted` to determine how the user arrived at a Wikipedia page:
- `"link"` — clicked a link (used for parent-child visit relationships)
- `"typed"` — typed URL or used address bar
- `"auto_bookmark"`, `"reload"`, etc.

Safari fires `onCommitted` but these fields are undefined.

### Workaround

The extension already has a content script (`src/content/index.ts`) that tracks clicked link text before navigation. This can be extended:

1. **Content script click listener** (already exists) — intercept clicks on Wikipedia internal links, send the source URL and target URL to the background before navigation occurs
2. **URL comparison** — if the new URL's referrer matches a tracked Wikipedia page, infer it was a link click
3. **Fallback** — if no click was detected, treat as a direct navigation (typed/bookmarked)

This won't perfectly distinguish all Chrome transition types but covers the primary use case: linking parent and child visits in a trail.

## iOS-Specific Considerations

### No `chrome.windows` API

The `windows` API doesn't exist on iOS. All window management code must be feature-gated:

```ts
if (typeof browser.windows !== "undefined") {
  // macOS: focus window
} else {
  // iOS: just switch to the tab
}
```

Affected features: window focus when navigating trails, window close detection for trail finalization.

### Service worker reliability

Multiple developers report that iOS Safari's service worker can die and **fail to wake up** for events. `webNavigation` events stop firing, `sendMessage` from content scripts fails to revive it. This may require:

- Defensive reconnection logic in content scripts
- State recovery on service worker restart
- Fallback event registration patterns
- Extensive real-device testing

This is a known platform issue, not something the extension can fully work around.

### Storage volatility

**Clearing Safari history on iOS also wipes extension IndexedDB and `chrome.storage` data.** Users could lose unsynced local trails. Mitigation:
- Encourage sync to protect against data loss
- Display a warning in onboarding

### Permission model

Safari uses **per-site, time-of-use permission granting**. Unlike Chrome (which grants `host_permissions` at install), Safari requires users to explicitly allow the extension on Wikipedia domains. Options per-site: "Ask", "Allow for One Day", "Always Allow".

The extension needs onboarding guidance: "When you first visit Wikipedia, tap the extension icon in the address bar and select 'Always Allow on Every Website' or 'Always Allow on This Website'."

## Development Without an Apple Developer Account

### macOS testing (fully functional, free)

**Option A: Temporary extension (quickest, no Xcode project)**
1. Safari → Settings → Advanced → enable "Show features for web developers"
2. Safari → Settings → Developer → "Add Temporary Extension..."
3. Select the built extension folder (`packages/extension/dist-dev/`)
4. Extension loads immediately — removed when Safari quits

**Option B: Xcode project (persists across builds)**
1. Install Xcode (free from App Store)
2. Convert:
   ```bash
   cd packages/extension && pnpm build:dev
   xcrun safari-web-extension-converter dist-dev/ \
     --project-location ~/Desktop/BreadcrumbsSafari \
     --app-name "Wikipedia Breadcrumbs" \
     --swift --macos-only
   ```
3. Open Xcode project, Build & Run
4. Safari → Settings → Developer → check "Allow unsigned extensions" (resets each Safari launch)
5. Enable in Safari → Settings → Extensions

### iOS testing (Simulator only, free)

- Xcode's iOS Simulator can run Safari with extensions — no Developer account needed
- Add `--ios-only` or omit `--macos-only` when running the packager to include an iOS target
- Physical device testing requires Apple Developer Program membership ($99/yr)

### What the $99/yr account adds

- Deploy to physical iOS devices
- Submit to the App Store
- TestFlight beta distribution
- Code signing for distribution

## Effort Estimate

| Work Area | Effort | Notes |
|---|---|---|
| Remove offscreen, custom Supabase storage adapter | High | Largest change — rearchitects data layer. Applies to Chrome too. |
| Tab-based OAuth (replace `chrome.identity`) | Medium | Edge Function callback exists; need extension callback page |
| Handle missing `transitionType` | Low-Medium | Extend existing content script click tracking |
| Feature-gate `chrome.windows` for iOS | Low | Conditional checks, ~10 lines |
| Xcode project + wrapper app | Low | `safari-web-extension-converter` does most of it |
| Permission onboarding UX | Low | Instructional text/screen |
| iOS service worker reliability testing | Medium | Real-device testing + defensive code |
| App Store submission (when ready) | Process | Review, screenshots, metadata |

**Overall: Medium-High.** The offscreen removal is the dominant task but has the benefit of simplifying the Chrome extension too. Most UI code (popup, options, content scripts, history page) works as-is.

## Recommended Approach

1. **Remove offscreen document first** — this is prerequisite for Safari and improves Chrome. Ship to Chrome Web Store to validate before starting Safari work.
2. **Replace `chrome.identity`** — implement tab-based OAuth, test on Chrome first (it works there too).
3. **Build Safari macOS target** — use the converter, test with unsigned extension.
4. **Handle Safari-specific gaps** — `transitionType` workaround, permission onboarding.
5. **Add iOS target** — feature-gate `windows` API, test in Simulator.
6. **Real-device iOS testing** — requires Apple Developer account. Address service worker reliability.
7. **App Store submission** — wrapper app, review, distribution.

Steps 1-2 are cross-browser improvements. Steps 3-4 get Safari working on macOS. Steps 5-7 bring iOS.
