# Service Worker Offline Fallback & Silent Auto-Update — Design Spec

## Summary

Fix the PWA's broken offline navigation fallback and add a zero-prompt auto-update
flow: new deploys activate immediately (`skipWaiting` + `clients.claim`) and the page
reloads itself exactly once, already served from the fresh cache. Covers analysis
opt #4 and UX quick-win #5. The update mechanics adapt the proven pattern in
[tenorune/on docs/pwa-auto-update.md](https://github.com/tenorune/on/blob/main/docs/pwa-auto-update.md);
the decision to go prompt-less was made during scoping (2026-07-13).

## Motivation

- **Offline fallback is broken.** `packages/pwa/src/service-worker.ts` precaches
  `[...build, ...files]`, but the navigation fallback does
  `caches.match("/index.html")`. The app is CSR-only (`ssr = false`,
  `adapter-static` with `fallback: "index.html"`), so the SPA fallback file is not in
  `build`, not in `files`, and — because nothing is prerendered — not in `prerendered`
  either. The match returns `undefined`, hidden by an unsafe
  `as Promise<Response>` cast: offline navigation gets a broken response instead of
  the app shell.
- **No update flow.** The SW has no `skipWaiting`/`clients.claim` and the app never
  calls `registration.update()`. Users run stale bundles until every tab/PWA instance
  fully closes — on iOS standalone, potentially indefinitely, since resumed PWAs don't
  re-check the SW on their own.

## Changes

### 1. Offline fallback fix (`service-worker.ts`)

- `ASSETS = [...build, ...files, ...prerendered, "/index.html"]`.
  - `"/index.html"` is the explicit fix: `cache.addAll` fetches it from the host,
    which serves the adapter-static fallback page there.
  - `prerendered` is included for future-proofing (it is empty today) and directly
    implements the analysis suggestion.
- Drop the `as Promise<Response>` cast. The navigation branch becomes: try
  `caches.match("/index.html")`; if it misses, return the existing 503 "Offline"
  response. No path returns `undefined`.
- Everything else in the fetch handler is unchanged (GET-only, Supabase hosts
  bypassed, cache-first with same-origin runtime caching).

### 2. Service worker side of the update flow

- `install`: after precaching, call `self.skipWaiting()`.
- `activate`: existing old-cache cleanup stays; add `self.clients.claim()`.
- Cache versioning already matches the reference pattern: `CACHE_NAME` embeds
  `version` from `$service-worker`, so a new build produces a byte-different SW and a
  new cache, and activation deletes the old ones.

### 3. Page side: registration module

New `packages/pwa/src/lib/sw-registration.ts`, called once from the root layout in the
browser, production builds only:

```typescript
export function initServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading || !hadController) return;
    reloading = true;
    window.location.reload();
  });

  navigator.serviceWorker.register("/service-worker.js").then((reg) => {
    const check = () => reg.update().catch(() => {});
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") check();
    });
    check();
  }).catch(console.error);
}
```

- `hadController` guard: no reload on a visitor's very first install.
- `reloading` guard: at most one reload per update, no loops.
- `registration.update()` on load and on every foreground — the foreground call is
  what makes updates reach iOS standalone, which never re-checks the SW on resume.
- SvelteKit's auto-registration is turned off (`kit.serviceWorker.register: false` in
  `svelte.config.js`) so this module owns the lifecycle; the SW file URL is SvelteKit's
  standard `/service-worker.js`.

### 4. Version-stamp mapping and caveat

The reference pattern content-hashes the shell into the SW at build time. Here,
SvelteKit's `version` fills that role. Caveat: `kit.version.name` defaults to a
build timestamp, so **every deploy triggers one silent reload**, even when no bytes
changed. Accepted for now; setting `kit.version.name` to the git commit hash later
would give true content-change semantics without touching this design.

### 5. Hosting requirement

The deployed `/service-worker.js` must be served with `Cache-Control: no-cache` (or
equivalent revalidation). A long-cached SW file disables the whole update path. This
goes in the implementation plan as a deploy-config checklist item.

## Safety of the silent reload

Reload happens at most once per deploy, typically right after foregrounding. In-app
edit state is safe: note edits save on blur/input (no Save buttons, per
ui-ux-guidelines), so a reload can lose at most an in-progress keystroke.

## Testing

- Unit: `sw-registration.ts` with a mocked `navigator.serviceWorker` — asserts the
  `hadController`/`reloading` guards (no reload on first install; exactly one reload
  on controller change; `update()` called on foreground).
- The SW itself is verified manually (documented as a checklist in the plan):
  1. `pnpm build`, serve `build/` statically, load app, go offline → navigation
     returns the app shell, not a 503.
  2. Make a trivial change, rebuild, redeploy → foreground the app → exactly one
     reload, new version live, old cache deleted (DevTools → Application).
  3. iOS standalone (or simulator): background/foreground → update arrives.

## Out of scope

- An "update available" prompt UI (decided against; silent reload).
- The Chrome extension (separate update mechanism via the Web Store).
- Runtime-caching strategy changes beyond the fallback fix.
- Setting `kit.version.name` to a git hash (noted as a follow-up option).
