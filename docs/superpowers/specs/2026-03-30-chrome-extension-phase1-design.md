# Chrome Extension Phase 1 — Design Spec

**Date:** 2026-03-30
**Status:** Draft
**Parent spec:** `2026-03-30-wikipedia-breadcrumbs-design.md`
**Scope:** Local-only, anonymous, background-mode capture with popup, history, and options pages.

---

## Overview

Phase 1 of the Chrome extension captures Wikipedia browsing history as breadcrumb trails entirely locally. No sync, no auth, no overlay UI. The extension runs in background mode by default — silently recording visits while the user browses Wikipedia, with a popup for quick trail view and controls, a full history page for browsing trails, and an options page for preferences.

**Dependencies:** `@wikipedia-breadcrumbs/shared` (models, db, wikipedia utils, trail detection, citations)

---

## Architecture

### Manifest V3

```json
{
  "manifest_version": 3,
  "name": "Wikipedia Breadcrumbs",
  "version": "0.1.0",
  "description": "Track your Wikipedia browsing trails",
  "permissions": ["storage", "tabs", "webNavigation", "alarms", "offscreen"],
  "host_permissions": ["*://*.wikipedia.org/*"],
  "background": {
    "service_worker": "background/index.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["*://*.wikipedia.org/wiki/*"],
      "js": ["content/index.js"],
      "run_at": "document_idle"
    }
  ],
  "action": {
    "default_popup": "popup/index.html",
    "default_icon": {
      "16": "icons/icon-16.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png"
    }
  },
  "icons": {
    "16": "icons/icon-16.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  },
  "options_page": "options/index.html"
}
```

### Package Structure

```text
packages/extension/
├── src/
│   ├── background/
│   │   ├── index.ts              # Service worker entry — event listeners
│   │   ├── capture.ts            # Visit capture orchestration
│   │   ├── trail-manager.ts      # Active trail state per tab, trail lifecycle
│   │   ├── alarm-manager.ts      # chrome.alarms for idle timeout
│   │   └── offscreen.ts          # Offscreen document lifecycle management
│   ├── content/
│   │   ├── index.ts              # Content script entry
│   │   └── link-tracker.ts       # Delegated click listener, link context extraction
│   ├── offscreen/
│   │   ├── index.html            # Offscreen document HTML
│   │   └── index.ts              # IndexedDB proxy — receives messages, performs DB ops
│   ├── popup/
│   │   ├── index.html
│   │   ├── main.ts               # Svelte mount
│   │   ├── App.svelte            # Popup root
│   │   ├── TrailView.svelte      # Current trail display
│   │   └── Controls.svelte       # Start/end trail, link to history
│   ├── history/
│   │   ├── index.html
│   │   ├── main.ts
│   │   ├── App.svelte
│   │   ├── TrailList.svelte      # All trails with search/filter
│   │   ├── TrailDetail.svelte    # Single trail view
│   │   └── VisitCard.svelte      # Individual visit display with citation copy
│   ├── options/
│   │   ├── index.html
│   │   ├── main.ts
│   │   ├── App.svelte
│   │   └── SettingsForm.svelte   # Idle timeout, capture toggle
│   ├── shared/
│   │   ├── messaging.ts          # Type-safe message passing (background <-> content, background <-> offscreen)
│   │   ├── device-id.ts          # Generate/persist device ID in chrome.storage.local
│   │   └── settings.ts           # Read/write user preferences from chrome.storage.local
│   └── types/
│       └── chrome.d.ts           # Type augmentations if needed
├── static/
│   └── icons/                    # Extension icons (placeholder PNGs for now)
├── package.json
├── tsconfig.json
├── vite.config.ts                # Multi-entry build for background, content, popup, history, options, offscreen
└── manifest.json                 # Source manifest (copied to dist)
```

---

## Service Worker (Background)

### Event Flow

1. `chrome.webNavigation.onCompleted` fires for a Wikipedia URL
2. Background checks `isWikipediaUrl()` and `parseWikipediaUrl()` from shared lib — non-article pages (Special:, Talk:, etc.) are filtered out here
3. Sends message to content script requesting link context (what link was clicked, referrer). If the content script hasn't loaded yet or doesn't respond within 500ms, treat as null click context.
4. Content script responds with `{ clickedLinkText, referrerUrl }` (or nulls if no click detected)
5. Background builds `TrailDetectionContext` and calls `shouldStartNewTrail()`
6. If new trail: creates trail via offscreen DB proxy, updates in-memory trail-to-tab map
7. If same trail: appends visit via offscreen DB proxy
8. Resets idle alarm for that tab

**articleId:** In phase 1, `articleId` is set to the URL title slug (e.g., `"Rust_(programming_language)"`). This is a stable-enough identifier for local use. Fetching the actual Wikipedia page ID via API is deferred to Phase 1.5 alongside article summaries/thumbnails.

### Active Trail State

The background service worker maintains an in-memory map of active trails per tab:

```typescript
interface ActiveTrailEntry {
  trailId: string;
  tabId: number;
  windowId: number;
  lastVisitTimestamp: number;  // Date.now() for idle calculation
  lastVisitPosition: number;   // For incrementing position
}

// Map<tabId, ActiveTrailEntry>
```

**SW restart recovery:** When the service worker restarts (MV3 can terminate it after ~5 minutes idle), the map is empty. On the next `webNavigation.onCompleted`, if no entry exists for the tab, the background queries IndexedDB (via offscreen) for the most recent active trail with a visit matching that `tabId`. If found and not timed out, it restores the entry. If not found or timed out, it starts a new trail.

### Tab Lifecycle

- `chrome.tabs.onRemoved` — finalize the active trail for that tab (set `status: finalized`, `endedAt`)
- `chrome.tabs.onReplaced` — treat as tab close + new tab (finalize old, new visit starts fresh)
- `chrome.windows.onRemoved` — finalize all active trails for tabs in that window

### Idle Timeout

- Uses `chrome.alarms` API (survives SW termination, unlike `setTimeout`)
- Alarm name format: `idle-tab-${tabId}`
- On each Wikipedia navigation, the alarm for that tab is cleared and re-created with the configured timeout (default 30 min)
- When alarm fires: the next Wikipedia visit in that tab will start a new trail (the alarm just marks the tab as "timed out" — no DB write on alarm fire, just remove the entry from the in-memory map so the next navigation triggers `shouldStartNewTrail` with `currentTrailTabId: null`)

---

## Offscreen Document (IndexedDB Proxy)

The MV3 service worker cannot directly access IndexedDB. An offscreen document is used as a proxy.

### Lifecycle

- Created on first DB operation request
- `chrome.offscreen.createDocument({ url: 'offscreen/index.html', reasons: ['WORKERS'], justification: 'IndexedDB access' })`
- Chrome may reclaim it at any time — the background must handle `chrome.runtime.sendMessage` failures by re-creating the document (max 3 retries with 500ms backoff; if still failing, log error and drop the operation)
- Only one offscreen document may exist at a time

### Message Protocol

The offscreen document receives messages and performs DB operations using the shared lib's `visitStore` and `trailStore`:

```typescript
type OffscreenRequest =
  | { type: "addVisit"; visit: Visit }
  | { type: "addTrail"; trail: Trail }
  | { type: "finalizeTrail"; trailId: string }
  | { type: "getActiveTrailForTab"; tabId: number }
  | { type: "getTrailsAll" }
  | { type: "getTrailById"; trailId: string }
  | { type: "getVisitsByTrailId"; trailId: string }
  | { type: "updateTrail"; trailId: string; changes: Partial<Trail> }
  | { type: "updateVisit"; visitId: string; changes: Partial<Visit> }
  | { type: "softDeleteTrail"; trailId: string }
  | { type: "searchVisits"; query: string };

type OffscreenResponse =
  | { success: true; data: unknown }
  | { success: false; error: string };
```

The `getActiveTrailForTab` query finds the most recent active trail whose latest visit has the given `tabId`. This is used for SW restart recovery. Since there is no `tabId` index on the visits table, the offscreen handler implements this as: query all active trails, then for each check the most recent visit's `tabId`. This is acceptable for phase 1 — the number of active trails is small (typically < 10). If performance becomes an issue, a `tabId` index can be added to the shared schema later.

The `searchVisits` query performs a client-side full-text search across visit `title` and `note` fields. This is implemented directly in the offscreen handler (not in the shared lib's `visitStore`) by iterating all visits with a case-insensitive substring match. Acceptable for local data volumes in phase 1.

---

## Content Script

### Link Click Tracking

Uses event delegation on `document.body` to capture link clicks on Wikipedia article links:

1. On `click` event, check if the target (or ancestor) is an `<a>` element with an `href` pointing to another Wikipedia article
2. Store the clicked link text and href in a module-scoped variable
3. When the background script sends a `getClickContext` message, respond with the stored data and clear it
4. If no click was detected (e.g., user typed URL, used back/forward), respond with nulls

### Referrer Detection

The content script reads `document.referrer` and includes it in the click context response. This helps the background determine if the navigation came from an external source.

### Message Handling

```typescript
type ContentMessage =
  | { type: "getClickContext" }
  | { type: "ping" };  // For checking if content script is injected

type ContentResponse =
  | { clickedLinkText: string | null; referrerUrl: string | null }
  | { pong: true };
```

---

## Popup UI

Small panel showing the current tab's active trail and quick controls.

### Components

**App.svelte** — Root. On mount, queries the background for the current tab's active trail.

**TrailView.svelte** — Displays:
- Trail name (auto-generated or user-set) with inline edit
- Visit count and duration (started X ago)
- Last 5 visits as a vertical breadcrumb list (title + timestamp)
- "See full trail" link opening history page filtered to this trail

**Controls.svelte** — Buttons:
- "Start New Trail" — sends message to background to manually start a new trail for this tab
- "End Trail" — finalizes the current trail
- "History" — opens the history page in a new tab
- "Options" — opens the options page

### Popup ↔ Background Communication

The popup sends messages to the background service worker:

```typescript
type PopupMessage =
  | { type: "getCurrentTrail"; tabId: number }
  | { type: "startNewTrail"; tabId: number }
  | { type: "endTrail"; trailId: string }
  | { type: "renameTrail"; trailId: string; name: string };
```

---

## History Page

Full-page trail browser opened in a new tab (`chrome-extension://[id]/history/index.html`).

### Components

**TrailList.svelte** — Lists all trails:
- Search box (filters by visit title/note)
- Sort by: most recent, oldest, starred first
- Each trail shows: name, visit count, date range, first/last article titles
- Click to expand inline or navigate to detail
- Star toggle on each trail
- Bulk select for delete

**TrailDetail.svelte** — Single trail expanded:
- Trail header: name (editable), tags, star toggle, date range
- Visit timeline: vertical list of visits in order
- Split trail: click between two visits to split
- Merge: select another trail to merge with

**VisitCard.svelte** — Individual visit:
- Article title (clickable link to Wikipedia)
- Timestamp
- Source badge (link, search, external, manual)
- Source detail (clicked link text or search query)
- Note field (inline editable)
- Citation copy button (opens format picker)

### Data Access

The history page creates its own `BreadcrumbsDB` instance directly (same-origin, same IndexedDB). No need to go through the offscreen proxy — extension pages have full DOM access.

### Background State Invalidation

When the history page (or popup) mutates trail state — delete, split, merge, finalize, rename — it must notify the background so it can update or clear its in-memory `ActiveTrailEntry` map. This is done via `chrome.runtime.sendMessage`:

```typescript
type TrailMutationMessage =
  | { type: "trailMutated"; trailId: string }
  | { type: "trailDeleted"; trailId: string };
```

The background handles `trailMutated` by clearing the affected entry from its map (the next navigation will re-query from DB). It handles `trailDeleted` by removing the entry entirely.

---

## Options Page

### Settings

| Setting | Storage key | Default | Type |
|---------|------------|---------|------|
| Idle timeout (minutes) | `idleTimeoutMinutes` | 30 | number (5-120) |
| Capture enabled | `captureEnabled` | true | boolean |

Settings are stored in `chrome.storage.local` and read by the background service worker on startup and on `chrome.storage.onChanged`.

---

## Settings & Device ID

### Device ID

Generated as `crypto.randomUUID()` on first extension install. Stored in `chrome.storage.local` under key `deviceId`. Read once by the background on startup and passed to `createTrail()`. If storage is cleared, a new device ID is generated — the extension treats this as a new device.

### Settings Module

```typescript
interface ExtensionSettings {
  idleTimeoutMinutes: number;
  captureEnabled: boolean;
}

const DEFAULTS: ExtensionSettings = {
  idleTimeoutMinutes: 30,
  captureEnabled: true,
};
```

Provides `getSettings()` and `updateSettings()` that read/write `chrome.storage.local`.

---

## Build Configuration

Vite multi-entry build producing:

```text
dist/
├── background/index.js       # Service worker (single bundle, no code splitting)
├── content/index.js           # Content script (single bundle)
├── offscreen/index.html       # Offscreen document
├── offscreen/index.js
├── popup/index.html           # Popup page
├── popup/assets/...           # Svelte components + CSS
├── history/index.html         # History page
├── history/assets/...
├── options/index.html         # Options page
├── options/assets/...
├── icons/...                  # Extension icons
└── manifest.json              # Copied from source
```

Key build requirements:
- Background and content scripts must be single bundles (no dynamic imports — MV3 service worker and content scripts don't support them)
- UI pages (popup, history, options) can use code splitting
- Shared lib is bundled into each entry (not externalized — extension has no module loader)
- `vite-plugin-web-extension` or manual Rollup config for multi-entry

---

## What's Deferred

| Feature | Phase |
|---------|-------|
| Overlay/sidebar mode | Phase 1.5 (needs mockup exploration) |
| Supabase sync | Phase 2 |
| Authentication (Google, Wikimedia OAuth) | Phase 3 |
| Export/import (JSON, CSV) | Phase 2 |
| Shared trail links | Phase 3 |
| Article summaries and thumbnails (Wikipedia API) | Phase 1.5 |
| Keyboard shortcuts | Phase 1.5 |
