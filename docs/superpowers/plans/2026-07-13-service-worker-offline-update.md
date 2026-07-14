# Service Worker Offline Fallback & Silent Auto-Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make offline navigation actually serve the app shell, and make new deploys activate immediately with exactly one silent page reload.

**Architecture:** The SW precaches the SPA fallback (`/index.html`) explicitly, adds `skipWaiting`/`clients.claim`, and keeps its version-stamped cache rotation. A new page-side registration module (SvelteKit auto-registration disabled) reloads once on `controllerchange` (guarded) and calls `registration.update()` on load and on every foreground for iOS standalone.

**Tech Stack:** SvelteKit (`$service-worker`, adapter-static, CSR-only), TypeScript, Vitest (new minimal harness for the PWA).

**Spec:** `docs/superpowers/specs/2026-07-13-service-worker-offline-update-design.md` (pattern source: https://github.com/tenorune/on/blob/main/docs/pwa-auto-update.md)

## Global Constraints

- **Toolchain first:** reconcile the pnpm 10→11 lockfile drift before installing anything (see `docs/ROADMAP.md` chores).
- PWA build requires `packages/pwa/.env` with `PUBLIC_*` vars (root `.env.example`).
- Work on a feature branch off `main`; commits end with the `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` trailer.
- Update UX is **silent auto-reload** — no prompt UI anywhere in this plan.
- Known pre-existing shared test failure (`tests/db/visits.test.ts`, same-ms) is not yours.

---

### Task 1: Fix the offline navigation fallback in the service worker

**Files:**
- Modify: `packages/pwa/src/service-worker.ts`

**Interfaces:**
- Produces: `ASSETS` includes `prerendered` and `"/index.html"`; the fetch handler never resolves `undefined` — offline navigations get the cached shell or a 503.

- [ ] **Step 1: Update precache list and fallback**

In `packages/pwa/src/service-worker.ts`, change the import and `ASSETS` (lines 6-9):

```typescript
import { build, files, prerendered, version } from "$service-worker";

const CACHE_NAME = `cache-${version}`;
// prerendered is empty today (CSR-only app) but included for future-proofing.
// "/index.html" is the adapter-static SPA fallback — it is NOT in build/files/
// prerendered, and the navigation fallback below depends on it being cached.
const ASSETS = [...build, ...files, ...prerendered, "/index.html"];
```

Replace the `.catch()` branch of the fetch handler (lines 41-46) — no `as Promise<Response>` cast, no `undefined` path:

```typescript
    }).catch(async () => {
      if (event.request.mode === "navigate") {
        const shell = await caches.match("/index.html");
        if (shell) return shell;
      }
      return new Response("Offline", { status: 503 });
    })
```

- [ ] **Step 2: Build and verify offline behavior manually**

```bash
pnpm --filter @wikipedia-breadcrumbs/shared build && pnpm --filter @wikipedia-breadcrumbs/pwa build
pnpm --filter @wikipedia-breadcrumbs/pwa preview
```

In the browser: load the app once (SW installs — note: until Task 4 lands, registration is SvelteKit's automatic one; this still works for this check). DevTools → Application → Cache Storage: `cache-<version>` contains `/index.html`. Then DevTools → Network → Offline, hard-navigate to `/trails` → the app shell loads (not a 503/error page).

- [ ] **Step 3: Commit**

```bash
git add packages/pwa/src/service-worker.ts
git commit -m "fix(pwa): precache SPA fallback so offline navigation works"
```

---

### Task 2: `skipWaiting` + `clients.claim` in the service worker

**Files:**
- Modify: `packages/pwa/src/service-worker.ts`

**Interfaces:**
- Produces: a newly installed SW activates immediately and takes control of open clients — the precondition for the page-side `controllerchange` reload (Task 3/4).

- [ ] **Step 1: Add a typed handle and the two calls**

Below the imports, add (the file's `self` is not typed as a SW scope):

```typescript
const sw = self as unknown as ServiceWorkerGlobalScope;
```

Install handler (skipWaiting after precache completes):

```typescript
self.addEventListener("install", (event: ExtendableEvent) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => sw.skipWaiting())
  );
});
```

Activate handler (claim after old-cache cleanup):

```typescript
self.addEventListener("activate", (event: ExtendableEvent) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => sw.clients.claim())
  );
});
```

- [ ] **Step 2: Build**

Run: `pnpm --filter @wikipedia-breadcrumbs/pwa build`
Expected: clean compile (the `ServiceWorkerGlobalScope` type comes from the existing `/// <reference lib="webworker" />`).

- [ ] **Step 3: Commit**

```bash
git add packages/pwa/src/service-worker.ts
git commit -m "feat(pwa): skipWaiting + clients.claim for immediate SW activation"
```

---

### Task 3: PWA vitest harness + `sw-registration.ts` (TDD)

**Files:**
- Create: `packages/pwa/src/lib/sw-registration.ts`
- Create: `packages/pwa/tests/sw-registration.test.ts`
- Create: `packages/pwa/vitest.config.ts`
- Modify: `packages/pwa/package.json` (test script + vitest devDep)

**Interfaces:**
- Produces: `initServiceWorker(): void` from `$lib/sw-registration` — registers `/service-worker.js`, reloads exactly once on `controllerchange` (never on first install), calls `registration.update()` on start and on every foreground. Also produces the PWA's first test harness (`pnpm --filter @wikipedia-breadcrumbs/pwa test`), reused by later roadmap items.

- [ ] **Step 1: Add the harness**

`packages/pwa/package.json` — add to `scripts`:

```json
    "test": "vitest run",
    "test:watch": "vitest"
```

and to `devDependencies` (same version as extension/shared):

```json
    "vitest": "^3.2.6"
```

Create `packages/pwa/vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
```

Run `pnpm install` (workspace root), then `pnpm --filter @wikipedia-breadcrumbs/pwa test` → "no test files found" is the expected state before Step 2.

- [ ] **Step 2: Write the failing tests**

Create `packages/pwa/tests/sw-registration.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { initServiceWorker } from "../src/lib/sw-registration";

type Listener = (...args: unknown[]) => void;

function makeEnv({ hasController }: { hasController: boolean }) {
  const swListeners = new Map<string, Listener[]>();
  const docListeners = new Map<string, Listener[]>();
  const registration = { update: vi.fn().mockResolvedValue(undefined) };
  const serviceWorker = {
    controller: hasController ? {} : null,
    addEventListener: (type: string, fn: Listener) => {
      swListeners.set(type, [...(swListeners.get(type) ?? []), fn]);
    },
    register: vi.fn().mockResolvedValue(registration),
  };
  const reload = vi.fn();
  vi.stubGlobal("navigator", { serviceWorker });
  vi.stubGlobal("window", { location: { reload } });
  vi.stubGlobal("document", {
    visibilityState: "visible",
    addEventListener: (type: string, fn: Listener) => {
      docListeners.set(type, [...(docListeners.get(type) ?? []), fn]);
    },
  });
  const fire = (map: Map<string, Listener[]>, type: string) =>
    (map.get(type) ?? []).forEach((fn) => fn());
  return { serviceWorker, registration, reload, swListeners, docListeners, fire };
}

describe("initServiceWorker", () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it("no-ops when serviceWorker is unsupported", () => {
    vi.stubGlobal("navigator", {});
    expect(() => initServiceWorker()).not.toThrow();
  });

  it("registers /service-worker.js and calls update() immediately", async () => {
    const env = makeEnv({ hasController: false });
    initServiceWorker();
    expect(env.serviceWorker.register).toHaveBeenCalledWith("/service-worker.js");
    await Promise.resolve(); // let register().then() run
    expect(env.registration.update).toHaveBeenCalledTimes(1);
  });

  it("calls update() again when the document becomes visible", async () => {
    const env = makeEnv({ hasController: false });
    initServiceWorker();
    await Promise.resolve();
    env.fire(env.docListeners, "visibilitychange");
    expect(env.registration.update).toHaveBeenCalledTimes(2);
  });

  it("does not reload on first install (no prior controller)", () => {
    const env = makeEnv({ hasController: false });
    initServiceWorker();
    env.fire(env.swListeners, "controllerchange");
    expect(env.reload).not.toHaveBeenCalled();
  });

  it("reloads exactly once on controllerchange when a controller existed", () => {
    const env = makeEnv({ hasController: true });
    initServiceWorker();
    env.fire(env.swListeners, "controllerchange");
    env.fire(env.swListeners, "controllerchange");
    expect(env.reload).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm --filter @wikipedia-breadcrumbs/pwa test`
Expected: FAIL — `src/lib/sw-registration` does not exist.

- [ ] **Step 4: Implement**

Create `packages/pwa/src/lib/sw-registration.ts`:

```typescript
/**
 * Silent PWA auto-update (adapted from tenorune/on docs/pwa-auto-update.md):
 * - hadController guard: no reload on a visitor's very first install
 * - reloading guard: at most one reload per update, never a loop
 * - registration.update() on start and on every foreground — required for
 *   iOS standalone, which never re-checks the SW on resume by itself
 */
export function initServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return;
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading || !hadController) return;
    reloading = true;
    window.location.reload();
  });

  navigator.serviceWorker
    .register("/service-worker.js")
    .then((reg) => {
      const check = () => reg.update().catch(() => {});
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") check();
      });
      check();
    })
    .catch((err) => console.error("[pwa] SW registration failed:", err));
}
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @wikipedia-breadcrumbs/pwa test`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/pwa/package.json packages/pwa/vitest.config.ts packages/pwa/src/lib/sw-registration.ts packages/pwa/tests/sw-registration.test.ts pnpm-lock.yaml
git commit -m "feat(pwa): SW registration module with guarded silent auto-reload"
```

---

### Task 4: Wire registration into the app, disable auto-registration

**Files:**
- Modify: `packages/pwa/svelte.config.js`
- Modify: `packages/pwa/src/routes/+layout.svelte:11-13`

**Interfaces:**
- Consumes: `initServiceWorker` (Task 3).
- Produces: exactly one registration path (ours); nothing in dev.

- [ ] **Step 1: Disable SvelteKit auto-registration**

`packages/pwa/svelte.config.js`:

```javascript
import adapter from "@sveltejs/adapter-static";

/** @type {import('@sveltejs/kit').Config} */
export default {
  kit: {
    adapter: adapter({
      pages: "build",
      assets: "build",
      fallback: "index.html",
    }),
    serviceWorker: {
      register: false,
    },
  },
};
```

- [ ] **Step 2: Call it from the root layout**

In `packages/pwa/src/routes/+layout.svelte`, add to the script imports:

```typescript
  import { dev } from "$app/environment";
  import { initServiceWorker } from "$lib/sw-registration";
```

and as the first line inside the existing `onMount` (before `initInstallStore()`):

```typescript
    if (!dev) initServiceWorker();
```

- [ ] **Step 3: Build + full update-cycle verification**

```bash
pnpm --filter @wikipedia-breadcrumbs/pwa build && pnpm --filter @wikipedia-breadcrumbs/pwa preview
```

Manual checklist (DevTools → Application → Service Workers):
1. First visit: SW installs and controls the page; **no reload happens** (hadController guard).
2. Offline (Network → Offline): navigate anywhere → app shell loads.
3. Make a trivial visible change (e.g. a string in `+page.svelte`), rebuild, restart preview. Focus the existing tab (or background/foreground it) → `update()` runs, new SW installs, **exactly one automatic reload**, change is visible.
4. Cache Storage: only the new `cache-<version>` remains; old one deleted.
5. Repeat a foreground with no new deploy → no reload.
6. If an iOS device/simulator is available: install standalone, deploy a change, background→foreground the app → update arrives with one reload.

- [ ] **Step 4: Deploy-config checklist (hosting)**

Wherever the PWA is deployed, confirm `/service-worker.js` is served with `Cache-Control: no-cache` (or equivalent revalidation). Record the hosting config change alongside this PR if it lives in-repo; otherwise note it in the PR description. A long-cached SW file silently disables the whole update flow.

- [ ] **Step 5: Commit**

```bash
git add packages/pwa/svelte.config.js packages/pwa/src/routes/+layout.svelte
git commit -m "feat(pwa): wire silent SW auto-update into app startup"
```

---

## Final verification

- [ ] `pnpm --filter @wikipedia-breadcrumbs/pwa test` — 5/5.
- [ ] Full manual cycle from Task 4 Step 3 passes.
- [ ] Known caveat (spec §4): `version` is a build timestamp, so every deploy triggers one reload even if bytes didn't change — expected, not a bug.
- [ ] Do NOT merge — hand back to the operator for review/manual testing (visual/update behavior especially).
