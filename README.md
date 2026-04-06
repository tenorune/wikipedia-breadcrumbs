# Wikipedia Breadcrumbs

Track and organize your Wikipedia browsing trails.

Wikipedia Breadcrumbs automatically records the pages you visit on Wikipedia, organizing them into **trails** — sequences of articles that tell the story of a research session. Available as a **Chrome extension** and a **progressive web app (PWA)** with cloud sync.

**[Try the web app](https://breadcrumbs.lightseed.net)**

## Features

- **Automatic trail capture** — the extension records Wikipedia visits as you browse, detecting new sessions via idle timeout
- **Trail management** — name, star, split, merge, and annotate trails with notes
- **Visit notes** — add notes to individual pages
- **Language badges** — flag non-native-language Wikipedia pages at a glance
- **Citations** — copy citations in Wikipedia, APA, MLA, Chicago, BibTeX, Markdown, or URL format
- **Search** — full-text search across all trail names, page titles, and notes
- **Export/Import** — JSON and CSV export, JSON import with conflict resolution
- **Cloud sync** — Supabase-powered sync across devices with 5-minute auto-sync
- **Three sign-in options** — Google, Wikimedia (Wikipedia account), or email/password
- **PWA install** — add to home screen on iOS and Android with guided install steps
- **Offline support** — full offline access via service worker caching
- **Redirect detection** — shows actual page titles when Wikipedia redirects
- **Accessibility** — WCAG AA contrast, screen reader support, keyboard navigation

## Architecture

Monorepo with three packages:

```
packages/
  shared/      Dexie DB schema, sync engine, export/import, citations, language badges
  extension/   Chrome extension (MV3) — service worker, content script, popup, settings
  pwa/         SvelteKit PWA — static adapter, Firebase Hosting
supabase/
  functions/   Wikimedia OAuth Edge Function
```

**Tech stack:** TypeScript, Svelte 5, SvelteKit, Vite, Dexie (IndexedDB), Supabase (auth + Postgres), Firebase Hosting

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm

### Setup

```bash
git clone https://github.com/tenorune/wikipedia-breadcrumbs.git
cd wikipedia-breadcrumbs
pnpm install
```

Copy environment files:

```bash
cp .env.example .env
cp packages/pwa/.env.example packages/pwa/.env
```

Fill in your Supabase and Google OAuth credentials. See `docs/setup/supabase-setup.md` for database setup.

### Development

```bash
# Build shared library (required first)
pnpm --filter shared build

# Run PWA dev server
pnpm --filter pwa dev

# Build extension (watches for changes)
pnpm --filter extension dev
```

Load the extension in Chrome: `chrome://extensions` > Enable Developer mode > Load unpacked > select `packages/extension/dist`

### Build

```bash
# Build everything
pnpm build

# Extension: separate dev/prod builds
cd packages/extension
pnpm build:dev    # -> dist-dev/
pnpm build:prod   # -> dist-prod/
```

### Deploy

```bash
# PWA dev
cd packages/pwa && cp .env.dev .env && pnpm build
firebase hosting:channel:deploy dev --project FIREBASE_ID

# PWA prod
cd packages/pwa && cp .env.prod .env && pnpm build
firebase deploy --only hosting --project FIREBASE_ID
```

## Privacy

Wikipedia Breadcrumbs only accesses `*.wikipedia.org`. Browsing data is stored locally on your device. Cloud sync is optional and requires sign-in. 

## License

All rights reserved.
