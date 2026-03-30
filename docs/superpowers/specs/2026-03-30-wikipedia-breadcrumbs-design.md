# Wikipedia Breadcrumbs — Design Spec

**Date:** 2026-03-30
**Status:** Draft
**Author:** tenorune

---

## Overview

Wikipedia Breadcrumbs is a tool for tracking and organizing Wikipedia browsing history as breadcrumb trails. It consists of three interoperable sub-projects: a shared data/storage library, a Chrome extension for automatic capture, and a PWA for viewing, managing, and manually adding to trails.

**Audience:** Small / Wikipedia enthusiast community. Open-source, publicly usable.

---

## Architecture

### Stack

| Layer | Technology |
| ------- | ----------- |
| Frontend framework | Svelte (extension UI) / SvelteKit (PWA) |
| Local storage | IndexedDB via Dexie.js |
| Remote backend | Supabase (Postgres, Auth, Row-Level Security) |
| Monorepo tooling | pnpm workspaces |
| Build | Vite |
| Language | TypeScript |

### Monorepo Structure

```text
wikipedia-breadcrumbs/
├── packages/
│   ├── shared/           # Core library — used by both extension and PWA
│   │   ├── models/       # TypeScript types for Visit, Trail, User
│   │   ├── db/           # IndexedDB wrapper (Dexie.js) — local persistence
│   │   ├── sync/         # Supabase sync logic — bidirectional local↔remote
│   │   ├── citation/     # Citation formatter (APA, MLA, BibTeX, etc.)
│   │   ├── trail/        # Trail detection logic (new trail heuristics, tab awareness)
│   │   └── wikipedia/    # URL parsing, article ID extraction, language detection
│   │
│   ├── extension/        # Chrome Extension (Manifest V3)
│   │   ├── background/   # Service worker — tab monitoring, visit capture
│   │   ├── content/      # Content script — link context, referrer detection
│   │   ├── popup/        # Quick trail view (Svelte)
│   │   ├── history/      # Full history page (Svelte)
│   │   ├── options/      # Settings page (Svelte)
│   │   └── manifest.json
│   │
│   └── pwa/              # Progressive Web App (SvelteKit)
│       ├── routes/       # Pages — trails, search, settings, shared trail viewer
│       ├── components/   # Shared Svelte UI components
│       ├── service-worker/ # Offline support, share target handler
│       └── static/       # Icons, manifest.webmanifest
│
├── pnpm-workspace.yaml
├── package.json          # Root — scripts, shared dev deps
├── tsconfig.json         # Base TypeScript config
└── vite.config.ts        # Shared Vite config base
```

---

## Data Model

### Visit

| Field | Type | Notes |
| ------- | ------ | ------- |
| `id` | UUID | Generated client-side for offline-first |
| `trail_id` | UUID | FK to Trail |
| `url` | string | Cleaned Wikipedia article URL |
| `title` | string | Article title |
| `timestamp` | ISO 8601 | When the visit occurred |
| `position` | integer | Order within the trail |
| `source_type` | enum | `link`, `search`, `external`, `manual`, `share_target` |
| `source_detail` | string | Nullable — the clicked link text, search query, or referrer URL |
| `tab_id` | integer | Browser tab ID (extension only, null for PWA entries) |
| `window_id` | integer | Browser window ID (extension only) |
| `note` | text | Nullable — user annotation |
| `summary` | text | Nullable — auto-captured article snippet |
| `thumbnail_url` | string | Nullable — from Wikipedia API |
| `language` | string | Wiki language code (e.g., `en`, `fr`) — extracted from subdomain |
| `article_id` | string | Wikipedia page ID — enables stable citation even if title changes |
| `sync_status` | enum | `local_only`, `synced`, `pending_sync` |
| `updated_at` | ISO 8601 | For sync conflict resolution |
| `deleted_at` | ISO 8601 | Nullable — soft delete |

### Trail

| Field | Type | Notes |
| ------- | ------ | ------- |
| `id` | UUID | |
| `user_id` | UUID | Nullable (anonymous users have local-only trails) |
| `name` | string | Nullable — auto-generated default, user can rename |
| `started_at` | ISO 8601 | Timestamp of first visit |
| `ended_at` | ISO 8601 | Timestamp of last visit, updated on each addition |
| `status` | enum | `active`, `finalized` — `active` means trail is still receiving visits; `finalized` means explicitly ended by user or tab close |
| `is_starred` | boolean | |
| `tags` | string[] | User-applied categories |
| `visibility` | enum | `private`, `unlisted`, `public` |
| `device_id` | string | Identifies which device created the trail. Generated as a random UUID on first launch, persisted in `chrome.storage.local` (extension) or `localStorage` (PWA). Not recoverable if storage is cleared — treated as a new device in that case |
| `forked_from_visit_id` | UUID | Nullable — the visit that spawned this trail via "open in new tab". Invariant: non-null if and only if `start_reason` is `forked` |
| `start_reason` | enum | `auto_new_tab`, `auto_timeout`, `auto_external`, `auto_search`, `auto_main_page`, `manual`, `forked` |
| `sync_status` | enum | `local_only`, `synced`, `pending_sync` |
| `updated_at` | ISO 8601 | For sync conflict resolution |
| `deleted_at` | ISO 8601 | Nullable — soft delete |

### User (Supabase Auth + profile table)

| Field | Type | Notes |
| ------- | ------ | ------- |
| `id` | UUID | Supabase auth user ID |
| `display_name` | string | |
| `created_at` | ISO 8601 | |

---

## Citation System

Citations are generated on-the-fly from Visit fields (`url`, `title`, `timestamp`, `language`, `article_id`), not stored separately. Lives in `packages/shared/citation/`.

**Supported formats:**

- Wikipedia citation template — `{{cite web |url=... |title=... |access-date=...}}`
- APA
- MLA
- Chicago
- BibTeX
- Plain URL
- Markdown link — `[Title](url)`

**UX:** Right-click a visit or click a copy button → format picker popover → copy to clipboard.

---

## Chrome Extension Architecture

### Permissions (Manifest V3)

- `storage` — local settings/preferences
- `tabs` — monitor tab navigation, get tab/window IDs
- `webNavigation` — detect navigation events with transition types
- `*://*.wikipedia.org/*` — content script injection
- `offscreen` — required for IndexedDB access from the MV3 service worker. The service worker cannot directly access IndexedDB; an offscreen document is created to proxy DB operations. Only one offscreen document may exist at a time; Chrome may reclaim it, so the background script must handle re-creation

### Capture Flow

1. `webNavigation.onCompleted` fires for a Wikipedia page
2. Background service worker receives the event with `tabId`, `windowId`, `transitionType`
3. Content script messages back with: link text clicked (if applicable), referrer info, page metadata
4. Trail detection logic (from `packages/shared`) decides:
   - Same trail → append visit with incremented `position`
   - New trail → triggered by: new tab, external referrer, Wikipedia search, idle timeout, Wikipedia Main Page, or **user explicit action**
   - Different tab/window → separate concurrent trail per tab
5. Visit saved to IndexedDB via shared db layer
6. Sync — if user is authenticated, queues the visit for Supabase sync (batched, debounced)

### Idle Timeout

A new trail is started when the user has not navigated to a new Wikipedia page in the same tab for a configurable duration (default: 30 minutes). "Idle" means time since the last `webNavigation.onCompleted` event for a Wikipedia URL in that specific tab — not global browser idle, not user input idle.

The timer is implemented using `chrome.alarms` API (not `setTimeout`) because the MV3 service worker may be terminated after ~5 minutes of inactivity. On each Wikipedia navigation, the alarm for that tab is reset. If the alarm fires before the next navigation, the next Wikipedia visit in that tab starts a new trail.

### Tab/Window Awareness

- Each tab tracked as a potential independent trail
- Trails keyed by `(tab_id, window_id)` while active
- When a tab closes, its active trail is finalized (`ended_at` set)
- If user opens a link in a new tab from an existing trail, the new trail stores `forked_from_visit_id`

### Explicit Trail Controls

| Action | Extension | PWA |
| -------- | ----------- | ----- |
| Start new trail | Button in popup + overlay panel, keyboard shortcut | Button on trails page + manual capture |
| End current trail | Same locations — finalizes the active trail on that tab | Available for any trail (including extension-originated trails synced to PWA) |
| Merge trails | Select trails in history page → combine into one | Same |
| Split trail | Click a visit in a trail → "split here" creates two trails | Same |

Manual starts override auto-detection. Trails record `start_reason` for context.

**Split mechanics:** Splitting a trail at visit N creates two trails. The original trail keeps visits 1..N; a new trail is created with visits N+1..end, with `position` values renumbered starting at 1. All affected visits get `trail_id` and `position` updated, marked `pending_sync`. This is a write-heavy operation — sync batches these updates in a single transaction.

**Merge mechanics:** Merging two trails interleaves visits by `timestamp` and renumbers `position` sequentially. The secondary trail is soft-deleted. All affected visits get `trail_id` and `position` updated, marked `pending_sync`.

### Display Modes

- **Overlay mode** — content script renders a visible UI panel on Wikipedia pages (form factor TBD — sidebar, top bar, or other; to be explored with mockups during implementation). Shows current trail in real-time, inline notes, citation copy. Collapsible, resizable, preference persisted. **Implementation note:** The overlay form factor is a blocker for the content script UI work and must be resolved via mockups before that work begins.
- **Background mode** — silent capture, no on-page UI. User interacts via popup or history page only.
- User toggleable in popup or options. Default: background mode.

### Extension UI Pages

- **Popup** — quick view of current tab's active trail, copy citation button, start/end trail, link to full history
- **History page** — full trail browser with search, filters, date grouping
- **Options** — sync settings, trail detection preferences (idle timeout, ignored pages), display mode toggle, export/import

---

## PWA Architecture

### Routes

| Route | Purpose |
| ------- | --------- |
| `/` | Landing — recent trails, quick stats |
| `/trails` | Browse/search all trails with filters (date, tags, starred) |
| `/trails/[id]` | Single trail view — visit timeline, annotations, citations |
| `/shared/[id]` | Public/unlisted trail viewer (no auth required, SSR for SEO) |
| `/add` | Manual capture — paste a Wikipedia URL or multiple URLs to add visits. Distinct from the JSON/CSV file import on `/settings` which is for backup restore and migration |
| `/settings` | Account, sync status, export/import, preferences |

### Share Target

- PWA manifest registers as a share target
- User shares a Wikipedia URL from any mobile app → hits `/add` with URL pre-filled
- Shared library parses URL, fetches article metadata via Wikipedia API, user picks which trail to append to or starts a new one

### Offline Support

- Service worker caches app shell and recently viewed trails
- IndexedDB is the primary data source — app works fully offline
- When connectivity returns, sync layer pushes/pulls changes

### SSR for Shared Trails

- `/shared/[id]` is server-rendered — public trails get proper meta tags, link previews, SEO
- Hosted on Vercel or Cloudflare Pages (SvelteKit adapters available for both)

### Pin-to-Home Seamlessness

- IndexedDB persists across browser → installed PWA transition (same origin)
- Auth session persists (same origin cookies/localStorage)
- Service worker already cached from browser usage — instant install
- No "first launch" experience after install — detects existing local data, skips onboarding
- Web app manifest: `display: standalone`, proper icons, `theme_color`, `start_url: /`
- Subtle install prompt shown after a few engagements, not on first visit

### Key UI Components

- `TrailTimeline` — visual breadcrumb chain with timestamps, expandable visit details
- `VisitCard` — article title, snippet, thumbnail, annotation, citation copy button
- `TrailHeader` — name, tags, star toggle, visibility toggle, share link
- `SearchBar` — full-text search across visits and annotations
- `CitationPopover` — format picker, copy to clipboard

---

## Sync & Storage

### Local Layer (both extension and PWA)

- IndexedDB via Dexie.js — single shared schema
- All writes go to IndexedDB first (offline-first)
- Each record has `updated_at` and `sync_status` (`local_only`, `synced`, `pending_sync`)

### Remote Layer (Supabase)

- Postgres tables mirror local schema
- Row-Level Security:
  - Users read/write only their own data
  - `public` and `unlisted` trails readable by anyone

### Sync Strategy — Last-Write-Wins

1. On connectivity / periodic interval / manual trigger, sync layer compares `updated_at` timestamps
2. Push: local `pending_sync` records → upsert to Supabase
3. Pull: remote records with `updated_at` > last sync timestamp → upsert to IndexedDB
4. Conflicts: last `updated_at` wins; losing version stored in `conflict_log` table for user review
5. Deletes: soft-delete with `deleted_at`, propagated on sync, hard-deleted after 30 days

### Conflict Log

| Field | Type | Notes |
| ------- | ------ | ------- |
| `id` | UUID | |
| `record_type` | enum | `visit`, `trail` |
| `record_id` | UUID | ID of the conflicting record |
| `losing_snapshot` | JSON | Full serialized record that lost the conflict |
| `winning_snapshot` | JSON | Full serialized record that won |
| `resolved_at` | ISO 8601 | Nullable — set when user acknowledges or resolves |
| `created_at` | ISO 8601 | When the conflict was detected |

Conflicts surface in the PWA settings page and extension options as a notification badge. User can review side-by-side and either accept the winner or restore the losing version.

### Sync Error Handling

- **Network failure mid-sync:** Operations are idempotent (upserts keyed by UUID). A failed sync is retried on the next trigger with no risk of duplication.
- **Partial batch failure:** Each record is upserted independently. Failed records stay `pending_sync`; successful ones are marked `synced`. Failed records are retried on next sync cycle.
- **Supabase rate limits:** Sync uses exponential backoff (1s, 2s, 4s, max 60s) on 429 responses.
- **Local status update failure:** If a push succeeds server-side but the local `sync_status` update fails, the record remains `pending_sync` and will be pushed again. Since the push is an upsert with the same UUID and `updated_at`, this is a no-op on the server.

### Anonymous → Authenticated Upgrade

- Anonymous local data has no `user_id`
- On sign-in, all local trails stamped with new `user_id` and queued for initial sync
- If account already has remote data, pull merges using the following dedup logic:
  - Trails are matched by `device_id` + `started_at` timestamp (same device, same start time = same trail)
  - Matched trails: remote version wins for metadata fields; visits are merged by `id` (UUID), no duplicates possible
  - Unmatched trails: kept as-is from both sources (different devices = different trails)

### Export/Import

- JSON export of full history (trails + visits) — portable, human-readable
- CSV export option for visits (spreadsheet-friendly)
- Import accepts same JSON format — supports migration from v0.3

---

## Authentication & Sharing

### Auth (Supabase Auth)

- **Anonymous-first** — no sign-up required, full local functionality
- **OAuth providers:** Google, Wikimedia
- **Session management:** Extension stores in `chrome.storage.local`, PWA uses standard cookies/localStorage

### Sharing

| Visibility | Behavior |
| ------------ | ---------- |
| `private` | Default. Only visible to owner. |
| `unlisted` | Accessible via direct link. Not indexed. |
| `public` | Listed on user's public profile (stretch goal). SSR for SEO and link previews. |

### Share Links

- Format: `https://[pwa-domain]/shared/[trail-id]`
- Unlisted trails use UUID (unguessable)
- Public trails can optionally get a slug
- Open Graph meta tags generated server-side (trail name, article count, first/last article titles)

---

## Priority Order for Data Model Features

1. Tab/window awareness
2. Link context (source_type, source_detail)
3. Trail metadata (name, tags, starred, visibility)
4. Annotations/notes
5. Article summaries and thumbnails
