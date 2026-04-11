# Safari Extension Port Research

## Goal

Understand what it would take to port the Chrome extension to Safari on macOS and iOS, enabling automatic Wikipedia trail capture on Apple platforms.

## Current Chrome Extension Architecture

The extension uses 7 Chrome API namespaces (offscreen was removed):

```
content script (Wikipedia pages) → background service worker → IndexedDB / Supabase directly
```

The offscreen document was removed — all operations (IndexedDB, Supabase auth/sync) now run directly in the background service worker using a custom `chrome.storage.local`-based adapter for Supabase session persistence. This change applies to both Chrome and Safari.

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

### Not Supported (resolved)

| API | Resolution |
|---|---|
| `chrome.offscreen` | **Done.** Removed — all operations run directly in the service worker with a `chrome.storage.local` adapter for Supabase session persistence. |
| `chrome.identity` (`getRedirectURL`, `launchWebAuthFlow`) | **Done.** Tab-based OAuth fallback on Safari: redirects to `Special:BlankPage` on Wikipedia, content script detects tokens in hash and sends to background. Chrome retains popup UX. |

## Resolved: Offscreen Document Removal

**Status: Done.** Merged to `dev`.

The offscreen document was removed. All operations run directly in the background service worker. The only dependency was `localStorage` for Supabase session persistence, solved with a custom `chrome.storage.local` adapter:

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

### Implementation details

See `docs/superpowers/plans/2026-04-10-remove-offscreen.md` for the full migration plan. Key files: `data-layer.ts`, `auth-layer.ts`, `sync-layer.ts`, `supabase-storage.ts` (all in `src/background/`).

Additional fixes discovered during implementation:
- **Sync timestamp not updating**: `chrome.runtime.sendMessage` can't send to the sender's own context. Replaced with direct `chrome.storage.local.set`.
- **Auth lost after SW restart**: Added `ensureSessionRecovered()` to restore session from storage and restart auto-refresh when the service worker wakes.

## Resolved: OAuth Without `chrome.identity`

**Status: Done.** Merged to `dev`.

### How it works

**Chrome:** Retains `chrome.identity.launchWebAuthFlow` for the polished popup UX.

**Safari:** Tab-based fallback using `launchTabAuthFlow()`:
1. Opens a new tab to the auth URL
2. Auth completes, Supabase redirects to `https://en.wikipedia.org/wiki/Special:BlankPage` with tokens in the hash fragment
3. The content script (which injects on Wikipedia pages) detects `access_token` in `window.location.hash` and sends `{ type: "authCallback", url }` to the background
4. Background extracts tokens, closes the auth tab, and focuses the originating Settings tab

Feature detection determines which path:
```ts
if (chrome.identity?.launchWebAuthFlow) {
  // Chrome: dedicated auth popup window
} else {
  // Safari: tab-based flow
}
```

**Key discovery:** Safari auto-allows `en.wikipedia.org` for content script injection (via `content_scripts.matches`) even before the user explicitly grants permission. This means the OAuth flow works on first run — no Wikipedia permission grant needed.

### Google OAuth on Safari

Routes through Supabase's `/auth/v1/authorize?provider=google` endpoint, which handles the entire OAuth flow server-side. Redirects to `Special:BlankPage` with Supabase session tokens.

### Wikimedia OAuth on Safari

Uses the existing Edge Function with `redirect_to` set to `Special:BlankPage`. Edge Function CORS was updated to accept `safari-web-extension://` origins.

### Requirements

- `https://en.wikipedia.org/**` must be in the Supabase project's redirect URL allowlist
- Edge Function must accept `wikipedia.org` in `isAllowedRedirect` and `safari-web-extension://` in CORS

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

Safari uses **per-site, time-of-use permission granting**. Unlike Chrome (which grants `host_permissions` at install), Safari requires users to explicitly allow the extension on Wikipedia domains.

**Observed behavior (macOS Safari, unsigned extension):**

- On fresh install, Wikipedia is set to **"Ask"** (not "Allow"). The user must explicitly grant access by clicking the extension icon on a Wikipedia page and selecting "Always Allow on This Website."
- On non-Wikipedia sites, clicking the extension icon triggers a permission prompt: "The extension would like to access [site]." The prompt offers only: "Allow for One Day", "Always Allow on This Website", "Always Allow on Every Website." **There is no "Don't Allow" or "Cancel" option.** The user must grant access to the non-Wikipedia site just to see the (empty) popup — or dismiss the prompt and see nothing.
- This makes the popup **unusable on non-Wikipedia sites** without granting unnecessary permissions. This is caused by `host_permissions` existing in the manifest, regardless of which domains are listed.
- Removing the `tabs` permission and using `activeTab` instead did not prevent this prompt.

**Impact on OAuth flow:**

The tab-based OAuth redirects to `Special:BlankPage` on Wikipedia. The content script detects tokens in the hash and sends them to the background. **This works on first run** because Safari auto-allows `en.wikipedia.org` for content script injection via `content_scripts.matches`, even though `host_permissions` shows as "Ask" for `wikipedia.org`. The distinction: `content_scripts.matches` grants auto-allow for specific subdomains, while `host_permissions` requires explicit user consent.

**Impact on popup:**

The popup is unusable on non-Wikipedia sites due to the permission prompt with no "Don't Allow" option. This is caused by `host_permissions` existing in the manifest and is the primary motivation for the content-script-driven approach below.

### Recommended fix: Content-script-driven capture (remove `host_permissions`)

The Safari permission prompt on non-Wikipedia sites is caused by `host_permissions` in the manifest. Removing it entirely would eliminate the prompt, but requires shifting from a **background-driven** to a **content-script-driven** capture model.

**Current architecture (background-driven):**
```
webNavigation.onCommitted (background) → parse URL → create visit → content script fills in details later
```
Requires `host_permissions` so `webNavigation` fires for Wikipedia pages.

**Proposed architecture (content-script-driven):**
```
content script loads on Wikipedia page → extracts URL, title, language, redirect info → sends pageVisited to background → background creates visit
```
Uses only `content_scripts.matches` — no `host_permissions` needed. Safari injects content scripts based on `matches` without prompting for site-wide access.

**What the content script already does:**
- Runs on `*://*.wikipedia.org/wiki/*` pages
- Tracks clicked link text (sends `linkClicked` to background)
- Responds to `getPageInfo` with page title and redirect info

**What it would need to do additionally:**
- On load, send a `pageVisited` message with full page data (URL, title, language, articleId)
- The existing click listener already provides parent-child linking data

**What the background would change:**
- Remove the `webNavigation.onCommitted` listener (and `webNavigation` permission)
- Handle `pageVisited` messages from the content script
- Reconciliation would use the background's own trail state instead of `chrome.tabs.query({ url: ... })`

**What we'd lose:**
- `transitionType` — already unavailable in Safari. Without it, the extension can't detect typed URLs, bookmarks, or search results, so **trails won't auto-split when a user types a new Wikipedia URL in the address bar within the same tab.** Safari users get fewer, longer trails that may contain unrelated topics. The content-script-driven approach can partially recover this: if no `linkClicked` message preceded the page load, the content script can infer it was a direct/external navigation and signal the background to start a new trail.
- Timing — `onCommitted` fires early in navigation; content scripts fire at `document_idle` (later). Trails start slightly later but functionally identical.
- Non-article Wikipedia pages — `content_scripts.matches` is `*://*.wikipedia.org/wiki/*` which already excludes Special pages, etc. Same effective filtering.

**What we'd gain:**
- No `host_permissions` → no Safari permission prompt on non-Wikipedia sites
- Simpler permission model — extension only runs code on Wikipedia
- Better alignment with Safari's expected extension behavior
- Potentially works on Firefox too (same content script model)
- Also addresses iOS service worker reliability (#45) — if the SW fails to wake for `webNavigation` events (known iOS bug), content-script-driven capture is more resilient since content scripts run independently

**Open questions:**
- `chrome.tabs.get(tabId).windowId` — likely still works without `host_permissions` since `windowId` isn't URL data
- SPA-like Wikipedia navigation — some Wikipedia features use History API `pushState`, which wouldn't trigger fresh content script injection. Would need a `popstate`/`pushState` listener in the content script.
- Cross-browser compatibility — Chrome supports both models, so the content-script approach could replace the current one for both browsers (not just Safari)

**Effort:** Medium. Touches capture.ts and content script. Data flow simplifies but edge cases around Wikipedia's client-side navigation need testing.

**Recommendation:** Implement as a cross-browser replacement. The Safari permission model makes `host_permissions` untenable — the popup is unusable on non-Wikipedia sites, and the OAuth flow breaks without prior Wikipedia permission. Removing `host_permissions` fixes both issues. Chrome supports the content-script model equally well, so there's no need for separate code paths.

### Onboarding (with content-script-driven approach)

If `host_permissions` is removed, the Safari permission model simplifies:
- Content scripts inject on Wikipedia pages based on `content_scripts.matches` — Safari may handle this with less friction than `host_permissions`
- The popup on non-Wikipedia sites shows the empty state without any permission prompt
- The user still needs to allow the content script on Wikipedia pages on first visit

**Recommended onboarding flow:**

1. **Wrapper app** (first screen after install): "Welcome to Wikipedia Breadcrumbs" → "Enable the extension in Safari Settings" → "Visit any Wikipedia page to start tracking"
2. **First Wikipedia visit**: Safari prompts to allow the content script. User taps "Always Allow on en.wikipedia.org"
3. **Settings page**: If Wikipedia access isn't granted yet, show a notice above sign-in: "Visit a Wikipedia page and allow access first" instead of sign-in buttons
4. **Sign-in**: Works automatically once Wikipedia access is granted — auth tab redirects to `Special:BlankPage`, content script captures tokens, tab closes

## Development Without an Apple Developer Account

### macOS + iOS testing (free)

**Build script:**
```bash
cd packages/extension
./build-safari.sh          # dev build
./build-safari.sh --prod   # prod build
```

Reads `SAFARI_XCODE_DIR`, `SAFARI_BUNDLE_ID`, `SAFARI_APP_NAME` from `.env.dev` / `.env.prod`. Generates an Xcode project with both macOS and iOS targets using `safari-web-extension-converter --copy-resources`.

**To test:**
1. Open the generated Xcode project (path shown in build output)
2. Build & Run in Xcode
3. Safari → Settings → Developer → check "Allow unsigned extensions" (resets each Safari launch)
4. Enable extension in Safari → Settings → Extensions

**Clean test (reset permissions):**
```bash
defaults delete com.apple.Safari ExtensionPermissions 2>/dev/null
```

**iOS Simulator** works without an Apple Developer account. Physical device testing requires Apple Developer Program membership ($99/yr).

### What the $99/yr account adds

- Deploy to physical iOS devices
- Submit to the App Store
- TestFlight beta distribution
- Code signing for distribution

## Progress

| Work Area | Status | Notes |
|---|---|---|
| Remove offscreen document | **Done** | Merged to `dev`. Applies to Chrome too. |
| Tab-based OAuth | **Done** | Content script callback on `Special:BlankPage`. Chrome retains popup UX. |
| Handle missing `transitionType` | **Done** | Made optional, defaults to Link. |
| Feature-gate `chrome.windows` for iOS | **Done** | All 4 call sites gated. |
| Xcode project + build script | **Done** | `build-safari.sh` with env-based config. |
| Dark mode (force light) | **Done** | Global CSS reset. Proper dark mode planned separately on `dev`. |
| Content-script-driven capture | **Recommended** | Removes `host_permissions`, fixes popup prompt on non-Wikipedia sites. |
| Permission onboarding UX (#44) | Pending | Depends on content-script-driven approach decision. |
| Storage volatility warning (#58) | Pending | Warn iOS users about history clearing. |
| iOS SW reliability (#45) | Pending | Defensive code + real-device testing. |
| App Store submission | Future | Requires Apple Developer account ($99/yr). |

## Next Steps

1. **Content-script-driven capture** — removes `host_permissions`, fixes Safari popup prompt on non-Wikipedia sites, improves iOS SW reliability. Cross-browser replacement.
2. **Permission onboarding (#44)** — after content-script approach lands, the onboarding simplifies.
3. **Storage volatility warning (#58)** — warn iOS users.
4. **iOS SW reliability (#45)** — defensive code now, real-device testing with Apple Developer account.
5. **App Store submission** — wrapper app, review, distribution.
