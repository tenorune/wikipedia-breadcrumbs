# Mobile Capture Research

## Goal

Allow users to share Wikipedia pages from their mobile browser into the PWA to build trails on mobile (where the Chrome extension isn't available).

## Platform Support (Web Share Target API)

| Platform | Standalone PWA | Share Target |
|---|---|---|
| Android Chrome | Yes | Yes |
| Android Edge | Yes | Yes |
| Android Samsung Internet | Yes | Yes |
| Android Firefox | No | No |
| iOS Safari | Yes (standalone) | **No** |
| iOS Chrome | No (bookmark) | No |

**Blocker:** iOS does not support Web Share Target API.

## Options Evaluated

### Option 1: Web Share Target (Android only)
- Quick win for Android users
- Manual per-page capture (not automatic)
- No iOS support

### Option 2: Native wrapper (Capacitor)
- Wraps existing PWA in a native shell (WebView)
- Enables share target on **both** iOS and Android
- Keeps SvelteKit codebase as-is, adds thin native layer
- Capacitor Share plugin registers as share target on both platforms
- Also enables: push notifications on both platforms, App Store/Play Store distribution, deep links, background processing
- **Tradeoffs:** Xcode + Android Studio needed, Apple Developer ($99/yr), App Store review, separate build pipeline, native dependency maintenance
- **PWABuilder** is a simpler alternative but less flexible

### Option 3: iOS Safari Web Extension
- Similar to Chrome extension but for Safari on iOS/macOS
- Could capture Wikipedia visits **automatically** (like desktop extension)
- Separate codebase from Chrome extension (uses WebExtension API subset)
- Requires Xcode and Apple Developer account ($99/yr)
- Could potentially share the same Supabase sync backend
- Apple provides `safari-web-extension-converter` to convert Chrome/Firefox extensions into the Xcode project structure, so extension code can largely be reused
- **Best parity with desktop extension** but most development effort
- **App Store distribution required:** Apple requires Safari Web Extensions to be packaged inside a native app — no standalone extension files. You create an Xcode project with a thin wrapper app (can be minimal — just a screen saying "enable the extension in Safari Settings"), the extension lives inside the app bundle as an extension target, and you submit the whole app to App Store review. Users download the app, then enable the extension in Safari Settings.

### Option 4: Lightweight alternatives
- iOS Shortcuts integration (user creates a shortcut to share to PWA URL)
- Clipboard-based capture (user copies URL, PWA detects on open)
- Browser bookmarklet that posts to the PWA

### Option 5: In-app Wikipedia reader
- Build a custom Wikipedia article reader inside the PWA using the Wikipedia REST API
- User searches/browses Wikipedia within the PWA — every navigation is captured automatically
- Cross-platform: works on iOS, Android, desktop — no native code, no browser extension
- Wikipedia REST API returns clean HTML for articles, supports search
- Intercept internal article links to load next article via API (full trail capture)
- Can cache articles for offline reading
- **Tradeoffs:** Not the real Wikipedia (no login/editing, different styling), need to render Wikipedia HTML well (tables, images, infoboxes, math, references), API rate limits (200 req/s), maintenance if Wikipedia changes API/HTML
- **Effort:** Moderate for basic reader, higher for polished Wikipedia HTML rendering
- **Best cross-platform automatic capture** without any native code

### Option 6: Browser bookmarklet
- JavaScript bookmark that runs on the current Wikipedia page, extracts URL/title/language
- Works on **every browser and platform** — iOS Safari, Chrome, Android, desktop
- Two modes: (A) opens PWA with URL params for trail picker, (B) silent POST to API (stays on Wikipedia)
- Rich data extraction since it runs on the page DOM (title, language, redirects)
- **Setup friction:** users must manually create a bookmark and paste JS into URL field on mobile — not intuitive, but one-time
- **Hybrid approach:** Android gets share target (easy), iOS gets bookmarklet (only option), bookmarklet available everywhere as fallback

## Comparison

| Approach | Auto capture | iOS | Android | Desktop | Effort |
|---|---|---|---|---|---|
| Web Share Target | Manual | No | Yes | No | Low |
| Native wrapper (Capacitor) | Manual (share) | Yes | Yes | No | Medium |
| Safari Web Extension | Automatic | Yes | No | macOS | High |
| Native wrapper + Safari ext | Auto iOS, share Android | Yes | Yes | No | High |
| Lightweight (bookmarklet) | Manual | Yes | Yes | Yes | Low |
| In-app Wikipedia reader | Automatic | Yes | Yes | Yes | Medium |

## `/add` Route — Universal Capture Endpoint

A PWA route at `/add?url=...&title=...` that receives a Wikipedia URL and lets the user add it to a trail. Built once, serves as the capture endpoint for multiple sources.

**Flow:** Load route → validate URL (reject non-Wikipedia) → extract language/articleId via url-parser.ts → show trail picker (sorted by most recent) + "New trail" → check duplicates → write visit to IndexedDB → redirect/close

**Sources that can call it:**
- Bookmarklet (Mode A): `window.open('breadcrumbs.lightseed.net/add?url=...')`
- Android share target: manifest `share_target` points to `/add`
- iOS Shortcut: user creates a Shortcut that opens the URL
- Manual paste: text field on the page
- Any automation/app that can open a URL

**After adding:**
- If opened by JS (bookmarklet): `window.close()`
- Otherwise: "Back to Wikipedia" link or navigate to trails
- Android share target: OS returns to previous app

## Wikimedia Reading Lists Integration

### What It Is

The Wikipedia mobile app lets logged-in users save articles to reading lists that sync across devices. A REST API exists at `/api/rest_v1/data/lists/`.

### API Details

| Method | Endpoint | Description |
|---|---|---|
| GET | `/data/lists/` | Get all user's lists (paginated) |
| GET | `/data/lists/{id}/entries/` | Get entries in a list (paginated) |
| GET | `/data/lists/changes/since/{date}` | Incremental sync (changes since timestamp) |
| GET | `/data/lists/pages/{project}/{title}` | Find which lists contain a page |

**Entry data:** `project` (wiki domain, e.g. `https://en.wikipedia.org`), `title` (page title in DB format, e.g. `Barack_Obama`), `created`, `updated`. Entries span any wiki language/project.

**Limits:** 100 lists per user, 1,000 entries per list, 12 lists / 100 entries per request.

### Integration Modes

**One-way import:** User connects Wikimedia account → Breadcrumbs fetches reading lists → each list maps to a trail. Entry `project` gives language, `title` gives article. One-time or on-demand.

**Ongoing sync:** Use `/data/lists/changes/since/{date}` for incremental pulls. When a user saves an article in the Wikipedia app, it appears in Breadcrumbs on next sync. Turns Wikipedia's "Save" into an automatic trail builder on mobile.

**Two-way sync:** Push Breadcrumbs visits back as reading list entries. Not recommended — API is marked "internal/unstable."

### How It Fits Mobile Capture

Complementary data source, not a replacement for automatic capture. Only captures articles the user *explicitly saves* in the Wikipedia app, not browsing history. But for users who already use Wikipedia's Save feature on mobile, their saved articles flow into Breadcrumbs trails with no bookmarklet, share target, or native wrapper needed.

### OAuth Requirements

The current Wikimedia OAuth consumer (`Wikipedia Breadcrumbs`, v3.0) is registered with **"User identity verification only"** — it cannot access reading lists or any user data beyond identity. Editing an existing consumer does not allow enabling new rights.

**Required grant:** `privateinfo` ("Access private information") — provides the `viewmyprivateinfo` right, which is what the Reading Lists REST API checks for all operations (reads and writes). There is no dedicated "reading lists" grant.

**To enable reading list access:** Register a new OAuth 2.0 consumer at [meta.wikimedia.org/wiki/Special:OAuthConsumerRegistration/propose/oauth2](https://meta.wikimedia.org/wiki/Special:OAuthConsumerRegistration/propose/oauth2):
- Select "Request authorization for specific permissions"
- Check `privateinfo` — the only additional grant needed beyond basic identity
- Use the **REST API** (`/api/rest_v1/data/lists/`) for all operations — it checks `viewmyprivateinfo` for both reads and writes, while the Action API requires `editmyprivateinfo` (a different right) for writes

**Caveats:** The reading lists API is marked **"internal or unstable"** — it may change without notice, and it's unclear whether Wikimedia would approve a third-party consumer for this purpose.

### Other Research Dead Ends

- **Wikipedia reading history API:** Wikimedia does not track or expose per-user reading history (privacy by design). No API exists for "pages I've read."
- **Browser history access (Android):** Deprecated since Android 6, not available on modern devices.
- **Accessibility service / VPN proxy:** Technically possible but invasive, impractical, likely rejected by app stores.
- **Firefox Android extension:** Firefox for Android supports WebExtensions — could port Chrome extension. Automatic capture but niche audience (low market share).

## Recommended Priority

1. **`/add` route + bookmarklet** — universal manual capture, low effort, build first
2. **Android share target** — layer on top of `/add` route for Android, low effort
3. **In-app Wikipedia reader** — best automatic cross-platform capture, medium effort
4. **Wikimedia reading lists import** — leverages existing user behavior, medium effort, blocked on OAuth grant update
5. **Safari Web Extension** — best iOS automatic capture, high effort, future consideration

**Decision pending:** Evaluating options for best mobile experience before committing to an approach.
