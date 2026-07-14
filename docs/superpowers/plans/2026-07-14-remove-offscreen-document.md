# Remove Offscreen Document Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the Chrome-only offscreen document and run IndexedDB (Dexie) + Supabase directly in the background service worker, using a `chrome.storage.local` adapter for Supabase session persistence.

**Architecture:** Replace `background SW → sendToOffscreen() envelope → offscreen document → IndexedDB/Supabase` with direct function calls inside the service worker. The offscreen document existed only because a service worker lacks a DOM/`localStorage` and Supabase defaults to `localStorage` for session persistence; a custom storage adapter removes that dependency. The offscreen handler's message switch becomes three direct-call modules (`data-layer`, `auth-layer`, `sync-layer`). This is a **behavior-preserving refactor** for Chrome.

**Tech Stack:** Svelte 5, Vite, Vitest, Dexie (IndexedDB), Supabase JS, Chrome MV3 service worker.

**Issue:** #39 (reopened). Original April plan: `docs/superpowers/plans/2026-04-10-remove-offscreen.md` (assumed April sources and was entangled with the content-script-capture rework; this plan is re-derived against current `main` and is offscreen-removal only).

## Global Constraints

- **Scope is offscreen-removal ONLY.** Do **not** touch the capture model, do **not** remove `webNavigation` / `tabs` / `host_permissions`, do **not** change `transitionType` handling. Those belong to #60 (content-script-driven capture) and stay out of this plan. The only manifest change here is removing the `"offscreen"` permission.
- **Base branch:** create `feat/remove-offscreen-document` off **`dev`** — the workstream-A integration branch (consolidates plans 1–4; carries the pinned pnpm `11.1.2` toolchain). This plan touches only `packages/extension/**` and one backward-compatible signature in `packages/shared`, so it does not collide with the shared-UI or sync-write-path work already on `dev`. Note the plan-1 interaction: `dev` already contains `f45bc50` (uses `restampForUser` in `offscreen/sync-handler.ts`), so Task 3's `sync-layer.ts` should call `restampForUser` rather than the inline stamping loops shown — see Task 3 note.
- **Commit trailer** on every commit: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- **Behavior-preserving:** the extension test suite stays green except that the deleted `sendToOffscreen` helper's own tests (`tests/background/offscreen.test.ts`) are removed with it — that reduction is expected, not a regression. The PWA is unaffected: `createSupabaseClient`'s new `storage` parameter is optional and backward-compatible.
- **Env:** extension `build:dev` needs `packages/extension/.env.dev`; the PWA build needs `packages/pwa/.env` (both present locally).
- **Commands:**
  - shared tests: `pnpm --filter @wikipedia-breadcrumbs/shared test`
  - extension tests: `pnpm --filter @wikipedia-breadcrumbs/extension test`
  - extension build: `pnpm --filter @wikipedia-breadcrumbs/extension build`
  - PWA build: `pnpm --filter @wikipedia-breadcrumbs/pwa build`

## File Structure

**Create:**
- `packages/extension/src/background/supabase-storage.ts` — `chrome.storage.local` adapter for Supabase.
- `packages/extension/src/background/data-layer.ts` — direct DB operations (from `offscreen/handler.ts`); owns the module-scoped `db` and sync-user-id.
- `packages/extension/src/background/auth-layer.ts` — Supabase auth ops (from `offscreen/auth-handler.ts`) + `ensureSessionRecovered()`.
- `packages/extension/src/background/sync-layer.ts` — sync-engine ops (from `offscreen/sync-handler.ts`); writes `lastSyncTime` to `chrome.storage.local` directly.
- `packages/extension/tests/background/data-layer.test.ts` — replaces `tests/offscreen/handler.test.ts`.

**Modify:**
- `packages/shared/src/sync/supabase-client.ts` — accept an optional storage adapter.
- `packages/shared/src/sync/index.ts` — export `SupabaseStorageAdapter`.
- `packages/extension/src/background/index.ts` — `sendToOffscreen()` → direct calls; drop the offscreen message guard; drop the `syncComplete` handler.
- `packages/extension/src/background/capture.ts` — `sendToOffscreen()` → direct `data.*` calls.
- `packages/extension/src/shared/messaging.ts` — remove `OffscreenRequest` / `OffscreenResponse` / `OffscreenEnvelope`.
- `packages/extension/manifest.json` — remove `"offscreen"` from `permissions`.
- `packages/extension/tests/background/capture.test.ts` — mock `data-layer.js` instead of `offscreen.js`.

**Delete:**
- `packages/extension/src/offscreen/{index.ts,index.html,handler.ts,auth-handler.ts,sync-handler.ts}`
- `packages/extension/src/background/offscreen.ts`
- `packages/extension/tests/offscreen/handler.test.ts` (moved to `data-layer.test.ts`)
- `packages/extension/tests/background/offscreen.test.ts` (tests the deleted `sendToOffscreen` helper)

---

### Task 1: Supabase storage adapter + shared client parameter

**Files:**
- Create: `packages/extension/src/background/supabase-storage.ts`
- Modify: `packages/shared/src/sync/supabase-client.ts`, `packages/shared/src/sync/index.ts`
- Test: `packages/shared/tests/sync/supabase-client.test.ts`

**Interfaces:**
- Produces: `createSupabaseClient(url, anonKey, storage?)` — optional `storage` forwarded to `createClient`'s `auth.storage`. `SupabaseStorageAdapter` type exported from `@wikipedia-breadcrumbs/shared`. `chromeStorageAdapter` in the extension background.

- [ ] **Step 1: Write the failing test for the storage parameter**

Create `packages/shared/tests/sync/supabase-client.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";

const createClientMock = vi.fn(() => ({ auth: {} }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: (url: string, key: string, opts: any) => createClientMock(url, key, opts),
}));

import { createSupabaseClient } from "../../src/sync/supabase-client.js";

describe("createSupabaseClient", () => {
  it("omits storage when no adapter is given (PWA path)", () => {
    createSupabaseClient("https://x.supabase.co", "anon");
    const opts = createClientMock.mock.calls.at(-1)![2];
    expect(opts.auth.persistSession).toBe(true);
    expect("storage" in opts.auth).toBe(false);
  });

  it("forwards a custom storage adapter when given (extension path)", () => {
    const storage = { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} };
    createSupabaseClient("https://x.supabase.co", "anon", storage);
    const opts = createClientMock.mock.calls.at(-1)![2];
    expect(opts.auth.storage).toBe(storage);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @wikipedia-breadcrumbs/shared test -- supabase-client`
Expected: FAIL — the second test errors because `createSupabaseClient` currently ignores a third argument (no `storage` on `opts.auth`).

- [ ] **Step 3: Add the optional storage parameter**

Replace `packages/shared/src/sync/supabase-client.ts` with:

```ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface SupabaseStorageAdapter {
  getItem(key: string): Promise<string | null> | string | null;
  setItem(key: string, value: string): Promise<void> | void;
  removeItem(key: string): Promise<void> | void;
}

export function createSupabaseClient(
  url: string,
  anonKey: string,
  storage?: SupabaseStorageAdapter,
): SupabaseClient {
  return createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      ...(storage ? { storage } : {}),
    },
  });
}

export type { SupabaseClient } from "@supabase/supabase-js";
```

- [ ] **Step 4: Export the new type**

In `packages/shared/src/sync/index.ts`, ensure `SupabaseStorageAdapter` is exported. If the file re-exports from `./supabase-client.js`, add the type; e.g.:

```ts
export type { SupabaseStorageAdapter } from "./supabase-client.js";
```

(Keep all existing exports in that file unchanged.)

- [ ] **Step 5: Create the chrome.storage adapter**

Create `packages/extension/src/background/supabase-storage.ts`:

```ts
/**
 * Supabase storage adapter backed by chrome.storage.local instead of localStorage.
 * Lets Supabase persist its session inside a service worker (which lacks localStorage).
 */
export const chromeStorageAdapter = {
  async getItem(key: string): Promise<string | null> {
    const result = await chrome.storage.local.get(key);
    return result[key] ?? null;
  },
  async setItem(key: string, value: string): Promise<void> {
    await chrome.storage.local.set({ [key]: value });
  },
  async removeItem(key: string): Promise<void> {
    await chrome.storage.local.remove(key);
  },
};
```

- [ ] **Step 6: Run tests + confirm the PWA still builds**

Run: `pnpm --filter @wikipedia-breadcrumbs/shared test`
Expected: PASS, including the two new `createSupabaseClient` cases.
Run: `pnpm --filter @wikipedia-breadcrumbs/pwa build`
Expected: build succeeds (PWA calls `createSupabaseClient` with two args; the third is optional).

- [ ] **Step 7: Rebuild shared so downstream type-checks see the new export**

Run: `pnpm --filter @wikipedia-breadcrumbs/shared build`
Expected: succeeds; `dist/` now exports `SupabaseStorageAdapter`.

- [ ] **Step 8: Commit**

```bash
git add packages/extension/src/background/supabase-storage.ts \
  packages/shared/src/sync/supabase-client.ts packages/shared/src/sync/index.ts \
  packages/shared/tests/sync/supabase-client.test.ts
git commit -m "feat: add chrome.storage.local adapter for Supabase session persistence"
```

---

### Task 2: Extract the data layer

**Files:**
- Create: `packages/extension/src/background/data-layer.ts`
- Create: `packages/extension/tests/background/data-layer.test.ts`

**Interfaces:**
- Produces (all use the module-scoped `db`; returns are **unwrapped** — the data value directly, not the old `{ success, data }` envelope):
  - `db: BreadcrumbsDB` (exported instance)
  - `getSyncUserId(): string | null`, `setSyncUserId(id: string | null): void`
  - `addVisit(visit: Visit): Promise<unknown>`
  - `addTrail(trail: Trail): Promise<unknown>`
  - `finalizeTrail(trailId: string): Promise<unknown>`
  - `getActiveTrailForTab(tabId: number): Promise<{ trail: Trail; lastVisit: Visit; visitCount: number } | null>`
  - `getActiveTrailByUrl(url: string): Promise<{ trail: Trail; lastVisit: Visit; visitCount: number } | null>`
  - `getActiveTrails(): Promise<Trail[]>`
  - `getTrailsAll(): Promise<Trail[]>`
  - `getTrailById(trailId: string): Promise<Trail | undefined>`
  - `getVisitsByTrailId(trailId: string): Promise<Visit[]>`
  - `updateTrail(trailId: string, changes: Partial<Trail>): Promise<unknown>`
  - `updateVisit(visitId: string, changes: Partial<Visit>): Promise<unknown>`
  - `softDeleteTrail(trailId: string): Promise<void>`
  - `softDeleteVisit(visitId: string): Promise<void>`
  - `findVisitByUrl(trailId: string, url: string, title?: string): Promise<Visit | null>`
  - `searchVisits(query: string): Promise<Visit[]>`

- [ ] **Step 1: Write the failing test**

Create `packages/extension/tests/background/data-layer.test.ts`. It uses the module's exported `db`, clearing tables between tests:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createVisit, createTrail, SourceType, StartReason } from "@wikipedia-breadcrumbs/shared";
import * as data from "../../src/background/data-layer.js";

describe("data-layer", () => {
  beforeEach(async () => {
    await data.db.open();
    await data.db.trails.clear();
    await data.db.visits.clear();
    data.setSyncUserId(null);
  });
  afterEach(async () => {
    await data.db.trails.clear();
    await data.db.visits.clear();
  });

  it("addTrail stores a trail", async () => {
    const trail = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    await data.addTrail(trail);
    expect(await data.db.trails.get(trail.id)).toBeDefined();
  });

  it("addVisit stores a visit", async () => {
    const visit = createVisit({ trailId: "t1", url: "https://en.wikipedia.org/wiki/Test", title: "Test", position: 1, sourceType: SourceType.Link, language: "en", articleId: "Test" });
    await data.addVisit(visit);
    expect(await data.db.visits.get(visit.id)).toBeDefined();
  });

  it("getTrailsAll returns all non-deleted trails", async () => {
    await data.addTrail(createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" }));
    expect((await data.getTrailsAll()).length).toBe(1);
  });

  it("getActiveTrailForTab finds trail by tab's latest visit", async () => {
    const trail = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    await data.addTrail(trail);
    const visit = createVisit({ trailId: trail.id, url: "https://en.wikipedia.org/wiki/Test", title: "Test", position: 1, sourceType: SourceType.Link, language: "en", articleId: "Test", tabId: 42 });
    await data.addVisit(visit);
    const found = await data.getActiveTrailForTab(42);
    expect(found?.trail.id).toBe(trail.id);
  });

  it("getActiveTrailForTab returns null for unknown tab", async () => {
    expect(await data.getActiveTrailForTab(999)).toBeNull();
  });

  it("finalizeTrail sets status to finalized", async () => {
    const trail = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    await data.addTrail(trail);
    await data.finalizeTrail(trail.id);
    const stored = await data.db.trails.get(trail.id);
    expect(stored?.status).toBe("finalized");
    expect(stored?.endedAt).not.toBeNull();
  });

  it("searchVisits finds visits by title substring", async () => {
    const trail = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    (trail as any).id = "t1";
    await data.addTrail(trail);
    await data.addVisit(createVisit({ trailId: "t1", url: "https://en.wikipedia.org/wiki/Rust", title: "Rust (programming language)", position: 1, sourceType: SourceType.Link, language: "en", articleId: "Rust" }));
    expect((await data.searchVisits("rust")).length).toBe(1);
  });

  it("findVisitByUrl matches by exact url then articleId", async () => {
    const trail = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    (trail as any).id = "t1";
    await data.addTrail(trail);
    await data.addVisit(createVisit({ trailId: "t1", url: "https://en.wikipedia.org/wiki/Sahabah", title: "Companions of the Prophet", position: 1, sourceType: SourceType.Link, language: "en", articleId: "Sahabah" }));
    const byUrl = await data.findVisitByUrl("t1", "https://en.wikipedia.org/wiki/Sahabah");
    expect(byUrl?.articleId).toBe("Sahabah");
    const byArticle = await data.findVisitByUrl("t1", "https://en.wikipedia.org/wiki/Sahabah?x=1");
    expect(byArticle?.articleId).toBe("Sahabah");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @wikipedia-breadcrumbs/extension test -- data-layer`
Expected: FAIL — `../../src/background/data-layer.js` does not exist.

- [ ] **Step 3: Create data-layer.ts**

Create `packages/extension/src/background/data-layer.ts` (logic lifted verbatim from `offscreen/handler.ts`, unwrapped into direct functions; `db` and the sync-user-id are module-scoped here):

```ts
import { BreadcrumbsDB, visitStore, trailStore, SyncStatus } from "@wikipedia-breadcrumbs/shared";
import type { Visit, Trail } from "@wikipedia-breadcrumbs/shared";

export const db = new BreadcrumbsDB();

let _syncUserId: string | null = null;
export function getSyncUserId(): string | null {
  return _syncUserId;
}
export function setSyncUserId(id: string | null): void {
  _syncUserId = id;
}

export async function addVisit(visit: Visit): Promise<unknown> {
  if (getSyncUserId()) {
    visit.syncStatus = SyncStatus.PendingSync;
  }
  return visitStore(db).add(visit);
}

export async function addTrail(trail: Trail): Promise<unknown> {
  const userId = getSyncUserId();
  if (userId) {
    trail.userId = userId;
    trail.syncStatus = SyncStatus.PendingSync;
  }
  return trailStore(db).add(trail);
}

export async function finalizeTrail(trailId: string): Promise<unknown> {
  return trailStore(db).finalize(trailId);
}

export async function getActiveTrailForTab(tabId: number): Promise<{ trail: Trail; lastVisit: Visit; visitCount: number } | null> {
  const trails = trailStore(db);
  const visits = visitStore(db);
  for (const trail of await trails.getActive()) {
    const trailVisits = await visits.getByTrailId(trail.id);
    const lastVisit = trailVisits[trailVisits.length - 1];
    if (lastVisit?.tabId === tabId) {
      return { trail, lastVisit, visitCount: trailVisits.length };
    }
  }
  return null;
}

export async function getActiveTrailByUrl(url: string): Promise<{ trail: Trail; lastVisit: Visit; visitCount: number } | null> {
  const trails = trailStore(db);
  const visits = visitStore(db);
  for (const trail of await trails.getActive()) {
    const trailVisits = await visits.getByTrailId(trail.id);
    if (trailVisits.some((v) => v.url === url)) {
      const lastVisit = trailVisits[trailVisits.length - 1];
      return { trail, lastVisit, visitCount: trailVisits.length };
    }
  }
  return null;
}

export async function getActiveTrails(): Promise<Trail[]> {
  return trailStore(db).getActive();
}

export async function getTrailsAll(): Promise<Trail[]> {
  return trailStore(db).getAll();
}

export async function getTrailById(trailId: string): Promise<Trail | undefined> {
  return trailStore(db).getById(trailId);
}

export async function getVisitsByTrailId(trailId: string): Promise<Visit[]> {
  return visitStore(db).getByTrailId(trailId);
}

export async function updateTrail(trailId: string, changes: Partial<Trail>): Promise<unknown> {
  return trailStore(db).update(trailId, changes);
}

export async function updateVisit(visitId: string, changes: Partial<Visit>): Promise<unknown> {
  return visitStore(db).update(visitId, changes);
}

export async function softDeleteTrail(trailId: string): Promise<void> {
  return trailStore(db).softDelete(trailId);
}

export async function softDeleteVisit(visitId: string): Promise<void> {
  return visitStore(db).softDelete(visitId);
}

export async function findVisitByUrl(trailId: string, url: string, title?: string): Promise<Visit | null> {
  const trailVisits = await visitStore(db).getByTrailId(trailId);
  // Exact URL match first
  let match = trailVisits.find((v) => v.url === url);
  // Fallback: match by articleId (handles same redirect URL revisited)
  if (!match) {
    const articleId = url.split("/wiki/")[1];
    if (articleId) {
      match = trailVisits.find((v) => v.articleId === articleId);
    }
  }
  // Fallback: match by title, case-insensitive
  if (!match && title) {
    const lowerTitle = title.toLowerCase();
    match = trailVisits.find((v) => v.title.toLowerCase() === lowerTitle);
  }
  return match ?? null;
}

export async function searchVisits(query: string): Promise<Visit[]> {
  const lowerQuery = query.toLowerCase();
  const results: Visit[] = [];
  for (const trail of await trailStore(db).getAll()) {
    for (const visit of await visitStore(db).getByTrailId(trail.id)) {
      if (visit.title.toLowerCase().includes(lowerQuery) || (visit.note && visit.note.toLowerCase().includes(lowerQuery))) {
        results.push(visit);
      }
    }
  }
  return results;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @wikipedia-breadcrumbs/extension test -- data-layer`
Expected: PASS (8 tests).

- [ ] **Step 5: Delete the old handler test**

The behavior it covered now lives in `data-layer.test.ts`.

```bash
git rm packages/extension/tests/offscreen/handler.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add packages/extension/src/background/data-layer.ts packages/extension/tests/background/data-layer.test.ts
git commit -m "feat: extract data layer from offscreen handler into background module"
```

---

### Task 3: Extract the auth and sync layers

**Files:**
- Create: `packages/extension/src/background/auth-layer.ts`
- Create: `packages/extension/src/background/sync-layer.ts`

**Interfaces:**
- Produces from `auth-layer.ts`:
  - `getSupabaseClient(): SupabaseClient` (built once with `chromeStorageAdapter`)
  - `ensureSessionRecovered(): Promise<void>` — recovers the session from `chrome.storage.local` and starts auto-refresh after a SW restart; call before `getSession()`.
  - `signInWithGoogle(idToken, nonce)`, `signInWithWikimedia(accessToken, refreshToken)`, `signInWithEmail(email, password)`, `signUpWithEmail(email, password)`, `signOut()`, `getAuthStatus()` — each returns `{ success: true, data }` or `{ success: false, error }`.
- Produces from `sync-layer.ts`: `enableSync()`, `disableSync()`, `syncNow()`, `getSyncStatus()`, `reinitSync()` — same `{ success, ... }` shape. On sync completion each writes `lastSyncTime` to `chrome.storage.local` **directly** (no `syncComplete` self-message).

- [ ] **Step 1: Create auth-layer.ts**

Create `packages/extension/src/background/auth-layer.ts` (from `offscreen/auth-handler.ts`, now using the storage adapter and adding session recovery):

```ts
import { createSupabaseClient } from "@wikipedia-breadcrumbs/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import { chromeStorageAdapter } from "./supabase-storage.js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

let supabaseClient: SupabaseClient | null = null;
let clientInitialized = false;

export function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    supabaseClient = createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY, chromeStorageAdapter);
    clientInitialized = false;
  }
  return supabaseClient;
}

/**
 * Ensure the Supabase client has recovered its session from chrome.storage.local
 * and started token auto-refresh. Must run before getSession() after a service
 * worker restart, since the async storage adapter means recovery is not instant.
 */
export async function ensureSessionRecovered(): Promise<void> {
  if (clientInitialized) return;
  const supabase = getSupabaseClient();
  await supabase.auth.getSession();
  await supabase.auth.startAutoRefresh();
  clientInitialized = true;
}

export async function signInWithGoogle(idToken: string, nonce: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.signInWithIdToken({ provider: "google", token: idToken, nonce });
  if (error) return { success: false as const, error: error.message };
  return { success: true as const, data: { user: data.user } };
}

export async function signInWithWikimedia(accessToken: string, refreshToken: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  if (error) return { success: false as const, error: error.message };
  return { success: true as const, data: { user: data.user } };
}

export async function signInWithEmail(email: string, password: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { success: false as const, error: error.message };
  return { success: true as const, data: { user: data.user } };
}

export async function signUpWithEmail(email: string, password: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return { success: false as const, error: error.message };
  return { success: true as const, data: { user: data.user } };
}

export async function signOut() {
  const supabase = getSupabaseClient();
  await supabase.auth.signOut();
  return { success: true as const };
}

export async function getAuthStatus() {
  await ensureSessionRecovered();
  const supabase = getSupabaseClient();
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user ?? null;
  return {
    success: true as const,
    data: {
      user,
      isAuthenticated: user !== null && !user.is_anonymous,
      isAnonymous: user?.is_anonymous ?? false,
      email: user?.email ?? null,
    },
  };
}
```

- [ ] **Step 2: Create sync-layer.ts**

Create `packages/extension/src/background/sync-layer.ts` (from `offscreen/sync-handler.ts`; note the two behavioral fixes vs. the offscreen version — `ensureSessionRecovered()` before `getSession()`, and `chrome.storage.local.set({ lastSyncTime })` instead of a `syncComplete` runtime message, which a service worker would not deliver to its own listener):

```ts
import { SyncEngine, SupabaseBackend, SyncStatus } from "@wikipedia-breadcrumbs/shared";
import type { SyncReport, SyncStateStore } from "@wikipedia-breadcrumbs/shared";
import { getSupabaseClient, ensureSessionRecovered } from "./auth-layer.js";
import { db, setSyncUserId } from "./data-layer.js";

let engine: SyncEngine | null = null;
let userId: string | null = null;
let lastReport: SyncReport | null = null;
let lastSyncTime: string | null = null;

const stateStore: SyncStateStore = {
  async getLastSyncTime() { return lastSyncTime; },
  async setLastSyncTime(time: string) { lastSyncTime = time; },
};

async function ensureInitialized(): Promise<boolean> {
  if (engine) return true;

  await ensureSessionRecovered();
  const supabase = getSupabaseClient();
  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData?.session?.user) {
    userId = sessionData.session.user.id;
  } else {
    return false;
  }

  setSyncUserId(userId);

  // Stamp all local trails with the current userId (handles account switch)
  const allTrails = await db.trails.toArray();
  for (const trail of allTrails.filter((t) => t.userId !== userId)) {
    await db.trails.update(trail.id, { userId, syncStatus: SyncStatus.PendingSync });
  }
  // Mark all unsynced visits for push
  const allVisits = await db.visits.filter((v) => v.syncStatus !== SyncStatus.Synced).toArray();
  for (const visit of allVisits) {
    await db.visits.update(visit.id, { syncStatus: SyncStatus.PendingSync });
  }

  const backend = new SupabaseBackend(supabase, userId);
  engine = new SyncEngine(db, backend, stateStore, userId);
  return true;
}

function runSync(): void {
  engine!.syncNow().then((report) => {
    lastReport = report;
    chrome.storage.local.set({ lastSyncTime: report.completedAt });
  }).catch((err) => console.error("[breadcrumbs] Sync error:", err));
}

export async function enableSync() {
  lastSyncTime = null; // force a full pull on enable
  const ok = await ensureInitialized();
  if (!ok) return { success: false as const, error: "Failed to initialize sync" };
  runSync();
  return { success: true as const, data: { started: true } };
}

export async function disableSync() {
  // Keep the client/session alive; just stop the engine so re-enable doesn't
  // create a new anonymous user.
  engine = null;
  return { success: true as const };
}

export async function syncNow() {
  if (!engine) {
    const ok = await ensureInitialized();
    if (!ok) return { success: false as const, error: "Sync not initialized" };
  }
  runSync();
  return { success: true as const, data: { started: true } };
}

export async function getSyncStatus() {
  const lst = await stateStore.getLastSyncTime();
  return { success: true as const, data: { lastSyncTime: lst, lastReport, isEnabled: !!engine } };
}

export async function reinitSync() {
  engine = null;
  userId = null;
  setSyncUserId(null);
  lastSyncTime = null;
  const ok = await ensureInitialized();
  if (!ok) return { success: false as const, error: "Failed to reinitialize sync" };
  runSync();
  return { success: true as const };
}
```

**Plan-1 interaction (base branch `dev`):** `dev` already carries `f45bc50`, which replaced the inline stamping loops in `offscreen/sync-handler.ts` with the shared `restampForUser` helper. To stay consistent, replace the two `ensureInitialized` stamping loops above with the shared helper:

```ts
import { restampForUser } from "@wikipedia-breadcrumbs/shared";
// …inside ensureInitialized(), in place of the two loops:
await restampForUser(db, userId);
```

Confirm the exact `restampForUser` signature in `packages/shared/src/sync/restamp.ts` on `dev` before wiring (it is exported from `@wikipedia-breadcrumbs/shared`), and keep whatever behavior `f45bc50` established.

- [ ] **Step 3: Type-check compiles (build the extension)**

Run: `pnpm --filter @wikipedia-breadcrumbs/extension build`
Expected: **still fails** — `index.ts` and `capture.ts` continue importing the not-yet-removed `./offscreen.js`; that is fine, those are rewired in Tasks 4–5. This step only confirms the two new files themselves have no type errors (no errors should reference `auth-layer.ts` / `sync-layer.ts`).

- [ ] **Step 4: Commit**

```bash
git add packages/extension/src/background/auth-layer.ts packages/extension/src/background/sync-layer.ts
git commit -m "feat: extract auth and sync layers from offscreen into background modules"
```

---

### Task 4: Rewire `background/index.ts` to direct calls

**Files:**
- Modify: `packages/extension/src/background/index.ts`

**Interfaces:**
- Consumes `data.*` (Task 2), `auth.*` / `sync.*` (Task 3). Removes the `sendToOffscreen` import and the offscreen message guard. Data-layer returns are unwrapped, so `.success` / `.data` checks are dropped.

- [ ] **Step 1: Swap the import**

In `packages/extension/src/background/index.ts`, replace:

```ts
import { sendToOffscreen } from "./offscreen.js";
```

with:

```ts
import * as data from "./data-layer.js";
import * as auth from "./auth-layer.js";
import * as sync from "./sync-layer.js";
```

- [ ] **Step 2: Replace `reconcileActiveTrails`**

Replace the whole function body with (unwrapped returns; logging simplified):

```ts
async function reconcileActiveTrails() {
  try {
    const activeTrails = await data.getActiveTrails();
    console.log("[breadcrumbs] reconcile: active trails:", activeTrails.length);
    if (activeTrails.length === 0) return;

    // Build a map of open Wikipedia tabs: URL -> tab
    const tabs = await chrome.tabs.query({ url: "*://*.wikipedia.org/*" });
    const urlToTab = new Map<string, chrome.tabs.Tab>();
    for (const tab of tabs) {
      if (tab.url && tab.id != null) urlToTab.set(tab.url, tab);
    }

    for (const trail of activeTrails) {
      const visits = await data.getVisitsByTrailId(trail.id);
      const lastVisit = visits[visits.length - 1];
      if (!lastVisit) continue;

      // Try to match by any visit URL in the trail, not just the last one
      let matchTab: chrome.tabs.Tab | undefined = urlToTab.get(lastVisit.url);
      if (!matchTab) {
        matchTab = [...urlToTab.entries()].find(([url]) => {
          try { return new URL(url).pathname.includes(lastVisit.articleId); }
          catch { return false; }
        })?.[1];
      }
      if (!matchTab) {
        for (const visit of visits) {
          matchTab = urlToTab.get(visit.url);
          if (matchTab) break;
          matchTab = [...urlToTab.entries()].find(([url]) => {
            try { return new URL(url).pathname.includes(visit.articleId); }
            catch { return false; }
          })?.[1];
          if (matchTab) break;
        }
      }

      if (matchTab && matchTab.id != null) {
        trailManager.setActive(matchTab.id, {
          trailId: trail.id,
          tabId: matchTab.id,
          windowId: matchTab.windowId ?? 0,
          lastVisitTimestamp: new Date(lastVisit.timestamp).getTime(),
          lastVisitPosition: visits.length,
          lastVisitUrl: lastVisit.url,
        });
        urlToTab.delete(matchTab.url!);
      }
    }

    // Finalize stale unmatched trails
    const staleThresholdMs = settings.idleTimeoutMinutes * 60 * 1000 * 2;
    const now = Date.now();
    for (const trail of activeTrails) {
      if (!trailManager.getByTrailId(trail.id)) {
        const age = now - new Date(trail.updatedAt).getTime();
        if (age > staleThresholdMs) {
          await data.finalizeTrail(trail.id);
        }
      }
    }
  } catch (err) {
    console.error("[breadcrumbs] reconcile failed:", err);
  }
}
```

- [ ] **Step 3: Update the sync toggle in `chrome.storage.onChanged`**

In the `chrome.storage.onChanged` listener, replace the two offscreen calls:

```ts
      sendToOffscreen({ type: "enableSync" });
```
→
```ts
      sync.enableSync();
```
and
```ts
      sendToOffscreen({ type: "disableSync" });
```
→
```ts
      sync.disableSync();
```

- [ ] **Step 4: Update the tab/window/alarm finalize sites**

There are four `sendToOffscreen({ type: "finalizeTrail", trailId: entry.trailId })` sites — in `chrome.tabs.onRemoved`, `chrome.tabs.onReplaced`, `chrome.windows.onRemoved`, and the idle-alarm branch of `chrome.alarms.onAlarm`. Replace each with:

```ts
      await data.finalizeTrail(entry.trailId);
```

In the same `chrome.alarms.onAlarm` listener, replace the sync-alarm call:

```ts
    await sendToOffscreen({ type: "syncNow" });
```
→
```ts
    await sync.syncNow();
```

- [ ] **Step 5: Drop the offscreen guard in the message listener**

In `chrome.runtime.onMessage.addListener`, delete this line (there are no more offscreen-targeted messages):

```ts
  if (message.target === "offscreen") return false;
```

- [ ] **Step 6: Replace `handleBackgroundMessage`**

Replace the entire `handleBackgroundMessage` function with (each case unwrapped; the `syncComplete` case is removed because `sync-layer` writes `lastSyncTime` to storage directly; auth/sync passthroughs become explicit direct calls):

```ts
async function handleBackgroundMessage(message: BackgroundMessage, sendResponse: (response: unknown) => void) {
  switch (message.type) {
    case "getCurrentTrail": {
      let entry = trailManager.getActive(message.tabId);

      if (!entry) {
        let recovered = await data.getActiveTrailForTab(message.tabId);
        if (!recovered) {
          try {
            const tab = await chrome.tabs.get(message.tabId);
            if (tab.url) {
              const { parseWikipediaUrl } = await import("@wikipedia-breadcrumbs/shared");
              const parsed = parseWikipediaUrl(tab.url);
              if (parsed) recovered = await data.getActiveTrailByUrl(parsed.cleanUrl);
            }
          } catch {}
        }
        if (recovered) {
          const { trail, lastVisit, visitCount } = recovered;
          let winId = 0;
          try { winId = (await chrome.tabs.get(message.tabId)).windowId; } catch {}
          entry = {
            trailId: trail.id, tabId: message.tabId, windowId: winId,
            lastVisitTimestamp: new Date(lastVisit.timestamp).getTime(), lastVisitPosition: visitCount,
            lastVisitUrl: lastVisit.url,
          };
          trailManager.setActive(message.tabId, entry);
        }
      }

      if (entry) {
        const visits = await data.getVisitsByTrailId(entry.trailId);
        const trail = await data.getTrailById(entry.trailId);
        sendResponse({ trail: trail ?? null, visits });
      } else {
        sendResponse({ trail: null, visits: [] });
      }
      break;
    }
    case "startNewTrail": {
      const existing = trailManager.getActive(message.tabId);
      if (existing) {
        await data.finalizeTrail(existing.trailId);
        trailManager.removeTab(message.tabId);
      }
      try {
        const tab = await chrome.tabs.get(message.tabId);
        if (tab.url) {
          const { parseWikipediaUrl, createTrail, createVisit, StartReason, SourceType } = await import("@wikipedia-breadcrumbs/shared");
          const parsed = parseWikipediaUrl(tab.url);
          if (parsed) {
            const trail = createTrail({ startReason: StartReason.Manual, deviceId });
            await data.addTrail(trail);
            const visit = createVisit({
              trailId: trail.id, url: parsed.cleanUrl, title: parsed.title, position: 1,
              sourceType: SourceType.Manual, language: parsed.language,
              articleId: parsed.cleanUrl.split("/wiki/")[1] ?? parsed.title,
              tabId: message.tabId,
            });
            await data.addVisit(visit);
            trailManager.setActive(message.tabId, {
              trailId: trail.id, tabId: message.tabId,
              windowId: tab.windowId ?? 0,
              lastVisitTimestamp: Date.now(), lastVisitPosition: 1,
              lastVisitUrl: parsed.cleanUrl,
            });
          }
        }
      } catch { /* tab may not be a Wikipedia page */ }
      sendResponse({ ok: true });
      break;
    }
    case "endTrail": {
      await data.finalizeTrail(message.trailId);
      trailManager.removeByTrailId(message.trailId);
      sendResponse({ ok: true });
      break;
    }
    case "renameTrail": {
      await data.updateTrail(message.trailId, { name: message.name });
      sendResponse({ ok: true });
      break;
    }
    case "resumeTrailInNewTab": {
      await data.updateTrail(message.trailId, { status: "active" as any, endedAt: null as any });
      const visitCount = (await data.getVisitsByTrailId(message.trailId)).length;

      const newTab = await chrome.tabs.create({ url: message.url });
      if (newTab.id != null) {
        trailManager.setActive(newTab.id, {
          trailId: message.trailId, tabId: newTab.id, windowId: newTab.windowId ?? 0,
          lastVisitTimestamp: Date.now(), lastVisitPosition: visitCount, lastVisitUrl: message.url,
        });
      }
      sendResponse({ ok: true });
      break;
    }
    case "navigateActiveTrail": {
      const entry = trailManager.getByTrailId(message.trailId);
      if (entry) {
        try {
          await chrome.tabs.update(entry.tabId, { active: true, url: message.url });
          await chrome.windows.update(entry.windowId, { focused: true });
        } catch {
          const newTab = await chrome.tabs.create({ url: message.url });
          if (newTab.id != null) {
            trailManager.removeTab(entry.tabId);
            trailManager.setActive(newTab.id, { ...entry, tabId: newTab.id, windowId: newTab.windowId ?? 0, lastVisitUrl: message.url });
          }
        }
      } else {
        await data.updateTrail(message.trailId, { status: "active" as any, endedAt: null as any });
        const visitCount = (await data.getVisitsByTrailId(message.trailId)).length;
        const newTab = await chrome.tabs.create({ url: message.url });
        if (newTab.id != null) {
          trailManager.setActive(newTab.id, {
            trailId: message.trailId, tabId: newTab.id, windowId: newTab.windowId ?? 0,
            lastVisitTimestamp: Date.now(), lastVisitPosition: visitCount, lastVisitUrl: message.url,
          });
        }
      }
      sendResponse({ ok: true });
      break;
    }
    case "trailMutated":
    case "trailDeleted": {
      trailManager.removeByTrailId(message.trailId);
      sendResponse({ ok: true });
      break;
    }
    case "syncNow": { sendResponse(await sync.syncNow()); break; }
    case "enableSync": { sendResponse(await sync.enableSync()); break; }
    case "disableSync": { sendResponse(await sync.disableSync()); break; }
    case "getSyncStatus": { sendResponse(await sync.getSyncStatus()); break; }
    case "reinitSync": { sendResponse(await sync.reinitSync()); break; }
    case "signInWithGoogle": { sendResponse(await auth.signInWithGoogle(message.idToken, message.nonce)); break; }
    case "signInWithEmail": { sendResponse(await auth.signInWithEmail(message.email, message.password)); break; }
    case "signUpWithEmail": { sendResponse(await auth.signUpWithEmail(message.email, message.password)); break; }
    case "signOut": { sendResponse(await auth.signOut()); break; }
    case "getAuthStatus": { sendResponse(await auth.getAuthStatus()); break; }
    case "signInWithWikimedia": {
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
        const redirectUrl = chrome.identity.getRedirectURL();
        const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
        const authResp = await fetch(
          `${supabaseUrl}/functions/v1/wikimedia-oauth?action=authorize&redirect_to=${encodeURIComponent(redirectUrl)}`,
          { headers: { "apikey": supabaseKey, "Authorization": `Bearer ${supabaseKey}` } }
        );
        const { url: wikimediaAuthUrl } = await authResp.json();
        if (!wikimediaAuthUrl) {
          sendResponse({ success: false, error: "Failed to get authorization URL" });
          break;
        }

        const responseUrl = await new Promise<string>((resolve, reject) => {
          chrome.identity.launchWebAuthFlow(
            { url: wikimediaAuthUrl, interactive: true },
            (callbackUrl) => {
              if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
              else if (callbackUrl) resolve(callbackUrl);
              else reject(new Error("No callback URL"));
            }
          );
        });

        const cbUrl = new URL(responseUrl);
        let params = new URLSearchParams(cbUrl.hash.substring(1));
        let accessToken = params.get("access_token");
        let refreshToken = params.get("refresh_token");
        if (!accessToken) {
          params = cbUrl.searchParams;
          accessToken = params.get("access_token");
          refreshToken = params.get("refresh_token");
        }

        if (accessToken && refreshToken) {
          sendResponse(await auth.signInWithWikimedia(accessToken, refreshToken));
        } else {
          const error = cbUrl.searchParams.get("wikimedia_error") ?? "No tokens in callback";
          sendResponse({ success: false, error });
        }
      } catch (err: any) {
        sendResponse({ success: false, error: err.message ?? "Wikimedia sign-in failed" });
      }
      break;
    }
  }
}
```

- [ ] **Step 7: Commit**

```bash
git add packages/extension/src/background/index.ts
git commit -m "refactor: rewire background/index.ts from sendToOffscreen to direct imports"
```

---

### Task 5: Rewire `capture.ts` + update its test

**Files:**
- Modify: `packages/extension/src/background/capture.ts`
- Modify: `packages/extension/tests/background/capture.test.ts`

**Interfaces:**
- Consumes `data.*` (Task 2). `capture.ts` no longer imports `./offscreen.js`. Its `capture.test.ts` mocks `./data-layer.js` instead.

- [ ] **Step 1: Update the capture.test.ts mock to fail first**

Replace the top of `packages/extension/tests/background/capture.test.ts` (imports + mock + the per-test dynamic imports) so it targets `data-layer.js`. Full new file:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetChromeMock } from "../chrome-mock.js";
import { TrailManager } from "../../src/background/trail-manager.js";
import { handleNavigation, type NavigationDetails } from "../../src/background/capture.js";

vi.mock("../../src/background/data-layer.js", () => ({
  addTrail: vi.fn(async (t: any) => t),
  addVisit: vi.fn(async (v: any) => v),
  getActiveTrailForTab: vi.fn(async () => null),
  getActiveTrailByUrl: vi.fn(async () => null),
  finalizeTrail: vi.fn(async () => undefined),
  findVisitByUrl: vi.fn(async () => null),
  updateVisit: vi.fn(async () => undefined),
  updateTrail: vi.fn(async () => undefined),
  softDeleteVisit: vi.fn(async () => undefined),
}));

function nav(overrides: Partial<NavigationDetails> = {}): NavigationDetails {
  return {
    tabId: 1,
    url: "https://en.wikipedia.org/wiki/Rust_(programming_language)",
    frameId: 0,
    windowId: 1,
    transitionType: "link",
    transitionQualifiers: [],
    clickedLinkText: null,
    ...overrides,
  };
}

describe("handleNavigation", () => {
  let trailManager: TrailManager;

  beforeEach(() => {
    resetChromeMock();
    trailManager = new TrailManager();
    vi.clearAllMocks();
  });

  it("creates new trail and visit for first navigation", async () => {
    const data = await import("../../src/background/data-layer.js");
    await handleNavigation(nav(), trailManager, "device-1", 30);
    expect(data.addTrail).toHaveBeenCalled();
    expect(data.addVisit).toHaveBeenCalled();
    expect(trailManager.getActive(1)).toBeDefined();
  });

  it("skips non-Wikipedia URLs", async () => {
    const data = await import("../../src/background/data-layer.js");
    await handleNavigation(nav({ url: "https://google.com" }), trailManager, "device-1", 30);
    expect(data.addTrail).not.toHaveBeenCalled();
    expect(data.addVisit).not.toHaveBeenCalled();
  });

  it("skips sub-frames", async () => {
    const data = await import("../../src/background/data-layer.js");
    await handleNavigation(nav({ frameId: 1 }), trailManager, "device-1", 30);
    expect(data.addTrail).not.toHaveBeenCalled();
    expect(data.addVisit).not.toHaveBeenCalled();
  });

  it("appends visit to existing trail in same tab", async () => {
    await handleNavigation(nav(), trailManager, "device-1", 30);
    await handleNavigation(nav({ url: "https://en.wikipedia.org/wiki/Cargo_(Rust)" }), trailManager, "device-1", 30);
    const entry = trailManager.getActive(1);
    expect(entry!.lastVisitPosition).toBe(2);
  });

  it("sets sourceType to Link for link transitions", async () => {
    const data = await import("../../src/background/data-layer.js");
    await handleNavigation(nav({ transitionType: "link" }), trailManager, "device-1", 30);
    const visit = (data.addVisit as any).mock.calls[0][0];
    expect(visit.sourceType).toBe("link");
  });

  it("sets sourceType to External for typed transitions", async () => {
    const data = await import("../../src/background/data-layer.js");
    await handleNavigation(nav({ transitionType: "typed" }), trailManager, "device-1", 30);
    const visit = (data.addVisit as any).mock.calls[0][0];
    expect(visit.sourceType).toBe("external");
  });

  it("sets sourceType to Search for generated transitions", async () => {
    const data = await import("../../src/background/data-layer.js");
    await handleNavigation(nav({ transitionType: "generated" }), trailManager, "device-1", 30);
    const visit = (data.addVisit as any).mock.calls[0][0];
    expect(visit.sourceType).toBe("search");
  });

  it("sets sourceDetail for address bar navigation", async () => {
    const data = await import("../../src/background/data-layer.js");
    await handleNavigation(nav({ transitionType: "typed", transitionQualifiers: ["from_address_bar"] }), trailManager, "device-1", 30);
    const visit = (data.addVisit as any).mock.calls[0][0];
    expect(visit.sourceDetail).toBe("address bar");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @wikipedia-breadcrumbs/extension test -- capture`
Expected: FAIL — `capture.ts` still imports `./offscreen.js`, so the `data-layer.js` mock isn't wired to production calls yet (assertions on `data.addTrail` fail).

- [ ] **Step 3: Rewire capture.ts**

In `packages/extension/src/background/capture.ts`, replace the import:

```ts
import { sendToOffscreen } from "./offscreen.js";
```
→
```ts
import * as data from "./data-layer.js";
```

Then replace each `sendToOffscreen(...)` with the unwrapped direct call. The exact substitutions:

- Recovery block:
  ```ts
  let recovered = await data.getActiveTrailForTab(tabId);
  console.log(`[breadcrumbs] capture: tabId recovery=${!!recovered}`);
  if (!recovered && parsed) {
    recovered = await data.getActiveTrailByUrl(parsed.cleanUrl);
    console.log(`[breadcrumbs] capture: URL recovery=${!!recovered}`);
  }
  if (recovered) {
    const { trail, lastVisit, visitCount } = recovered;
    current = {
      trailId: trail.id, tabId, windowId: details.windowId,
      lastVisitTimestamp: new Date(lastVisit.timestamp).getTime(),
      lastVisitPosition: visitCount, lastVisitUrl: lastVisit.url,
    };
    trailManager.setActive(tabId, current);
  }
  ```
- Main Page finalize: `await data.finalizeTrail(current.trailId);`
- New-trail branch: `await data.addTrail(trail);` and `await data.addVisit(visit);`
- Same-trail revisit check:
  ```ts
  const existing = await data.findVisitByUrl(current.trailId, parsed.cleanUrl, parsed.title);
  const now = new Date().toISOString();
  if (existing) {
    await data.updateVisit(existing.id, { lastVisitedAt: now });
  } else {
    let parentVisitId: string | null = null;
    if (current.lastVisitUrl) {
      const parentParsed = parseWikipediaUrl(current.lastVisitUrl);
      const parentMatch = await data.findVisitByUrl(current.trailId, current.lastVisitUrl, parentParsed?.title);
      if (parentMatch) parentVisitId = parentMatch.id;
    }
    const position = trailManager.incrementPosition(tabId, parsed.cleanUrl);
    const visit = createVisit({
      trailId: current.trailId, url: parsed.cleanUrl, title: parsed.title, position,
      sourceType: inferSourceType(transitionType, transitionQualifiers),
      sourceDetail: inferSourceDetail(transitionType, transitionQualifiers),
      language: parsed.language,
      articleId: parsed.cleanUrl.split("/wiki/")[1] ?? parsed.title,
      parentVisitId, tabId,
    });
    await data.addVisit(visit);
  }
  await data.updateTrail(current.trailId, { updatedAt: now } as any);
  ```
- Deferred `setTimeout` title/redirect block — replace its four calls:
  ```ts
  const existingByTitle = await data.findVisitByUrl(capturedTrailId, "", actualTitle);
  if (existingByTitle) {
    const duplicate = await data.findVisitByUrl(capturedTrailId, capturedUrl);
    if (duplicate && duplicate.id !== existingByTitle.id) {
      const nowTs = new Date().toISOString();
      await data.updateVisit(existingByTitle.id, { lastVisitedAt: nowTs });
      await data.softDeleteVisit(duplicate.id);
      return;
    }
  }
  ```
  and:
  ```ts
  if (Object.keys(changes).length > 0) {
    const result = await data.findVisitByUrl(capturedTrailId, capturedUrl);
    if (result) {
      await data.updateVisit(result.id, changes);
    }
  }
  ```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @wikipedia-breadcrumbs/extension test -- capture`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/extension/src/background/capture.ts packages/extension/tests/background/capture.test.ts
git commit -m "refactor: rewire capture.ts from sendToOffscreen to direct imports"
```

---

### Task 6: Delete the offscreen document + clean up

**Files:**
- Delete: `packages/extension/src/offscreen/{index.ts,index.html,handler.ts,auth-handler.ts,sync-handler.ts}`, `packages/extension/src/background/offscreen.ts`, `packages/extension/tests/background/offscreen.test.ts`
- Modify: `packages/extension/manifest.json`, `packages/extension/src/shared/messaging.ts`

**Interfaces:**
- Consumes: nothing imports the offscreen files after Tasks 4–5. This task confirms that and removes them.

- [ ] **Step 1: Remove the `offscreen` permission**

In `packages/extension/manifest.json`, change:

```json
  "permissions": ["storage", "tabs", "webNavigation", "alarms", "offscreen", "identity"],
```
to (drop only `"offscreen"`; keep everything else — `webNavigation`, `tabs`, and `host_permissions` stay, per Global Constraints):

```json
  "permissions": ["storage", "tabs", "webNavigation", "alarms", "identity"],
```

- [ ] **Step 2: Remove the offscreen message types**

In `packages/extension/src/shared/messaging.ts`, delete the `OffscreenRequest` union (lines beginning `export type OffscreenRequest =` through its final member), the `OffscreenResponse` type, and the `OffscreenEnvelope` interface at the bottom. Keep `ContentMessage`, `ContentResponse`, `PopupMessage`, `TrailMutationMessage`, and `BackgroundMessage` exactly as-is. The file after editing should contain only those five types plus the `import type { Visit, Trail }` line if still referenced (it is — `PopupMessage`/`BackgroundMessage` do not use `Visit`/`Trail`, so if nothing else references the import, remove it to avoid an unused-import error). Verify by search in Step 4.

- [ ] **Step 3: Delete the offscreen files**

```bash
git rm packages/extension/src/offscreen/index.ts \
  packages/extension/src/offscreen/index.html \
  packages/extension/src/offscreen/handler.ts \
  packages/extension/src/offscreen/auth-handler.ts \
  packages/extension/src/offscreen/sync-handler.ts \
  packages/extension/src/background/offscreen.ts \
  packages/extension/tests/background/offscreen.test.ts
```

- [ ] **Step 4: Confirm nothing still references offscreen**

Run: `git grep -n "offscreen\|sendToOffscreen\|OffscreenRequest\|OffscreenResponse\|OffscreenEnvelope" -- packages/extension/src`
Expected: **no matches**. (If `messaging.ts` shows an unused `import type { Visit, Trail }`, remove that line now.)

- [ ] **Step 5: Run the full extension suite**

Run: `pnpm --filter @wikipedia-breadcrumbs/extension test`
Expected: PASS. The suite is smaller than the previous 45 by exactly the `offscreen.test.ts` cases (the `sendToOffscreen` helper no longer exists) and the moved `handler.test.ts` (now `data-layer.test.ts`); all remaining tests are green. Note the new count in the commit body.

- [ ] **Step 6: Build the extension**

Run: `pnpm --filter @wikipedia-breadcrumbs/extension build`
Expected: build succeeds, with no references to deleted files and no `chrome.offscreen` usage.

- [ ] **Step 7: Commit**

```bash
git add -A packages/extension/
git commit -m "refactor: remove offscreen document — all operations run directly in service worker"
```

---

### Task 7: Manual smoke test (Chrome)

No automated test exercises a running MV3 service worker. This is a hands-on verification checklist — apply the wp-breadcrumbs-ui skill for any UI observations. Reload the extension between sections and watch the service-worker console.

- [ ] **Step 1: Build the dev extension**

Run: `pnpm --filter @wikipedia-breadcrumbs/extension build:dev`
Load `packages/extension/dist-dev/` unpacked at `chrome://extensions`. Open the service-worker console; confirm no "offscreen" errors on startup.

- [ ] **Step 2: Trail capture**
  1. Open a Wikipedia article → a trail starts.
  2. Click internal links → visits append (same trail, incrementing positions).
  3. Type a new Wikipedia URL in the address bar (same tab) → a new trail starts (confirms `transitionType`-driven auto-split still works — this is the behavior #60 would change, and must remain intact here).
  4. Open the popup → current trail and its visits render.
  5. Close the tab → the trail finalizes.

- [ ] **Step 3: Trail recovery across SW restart**
  1. With an active trail, click "Service Worker" → terminate it in `chrome://extensions` (or wait for idle).
  2. Reopen the popup / navigate again → the trail is recovered by tab id or URL (via `data.getActiveTrailForTab` / `getActiveTrailByUrl`), not lost.

- [ ] **Step 4: Auth (the SW-restart-sensitive path)**
  1. Options page → sign in with Google → completes; signed-in state shows.
  2. Sign out → session clears.
  3. Sign in with Wikimedia → OAuth completes.
  4. Terminate the service worker, reopen options → still signed in (confirms `ensureSessionRecovered()` restores the session from `chrome.storage.local`).

- [ ] **Step 5: Sync (the timestamp fix)**
  1. Signed in, enable sync → sync runs (watch console).
  2. Confirm the settings UI's "last synced" time updates (confirms `chrome.storage.local.set({ lastSyncTime })` in `sync-layer`, replacing the old `syncComplete` self-message).
  3. Disable, then re-enable sync → runs again without creating a new anonymous user.

- [ ] **Step 6: History page operations**
  1. Open the history page → trails load.
  2. Delete a trail, rename a trail, search visits → all behave as before.

- [ ] **Step 7: Commit any fixes found**

Commit each fix discovered during the smoke test with a focused message and the standard trailer.

---

## Final verification

- [ ] `pnpm --filter @wikipedia-breadcrumbs/shared test` — green (incl. the two new `createSupabaseClient` cases).
- [ ] `pnpm --filter @wikipedia-breadcrumbs/extension test` — green (count reduced only by the removed `sendToOffscreen` helper tests).
- [ ] `pnpm --filter @wikipedia-breadcrumbs/extension build` and `pnpm --filter @wikipedia-breadcrumbs/pwa build` — both succeed.
- [ ] `git grep -n "offscreen" -- packages/extension/src` — no matches.
- [ ] `manifest.json` no longer lists `"offscreen"`; `webNavigation` / `tabs` / `host_permissions` unchanged (this plan is not #60).
- [ ] Manual Chrome smoke test complete: capture, cross-restart recovery, auth persistence, sync timestamp, history ops.
- [ ] Do NOT merge — hand back to the operator for review and manual testing. Close #39 only after this lands on the integration branch.

## Self-review notes (coverage vs. issue #39)

- Delete `src/offscreen/` + `background/offscreen.ts` → Tasks 6.
- Remove `"offscreen"` permission → Task 6 Step 1.
- `BreadcrumbsDB` in the SW → Task 2 (module-scoped `db` in `data-layer`).
- `chrome.storage.local` Supabase adapter → Task 1.
- Move auth + sync into the SW → Task 3.
- Replace `sendToOffscreen()` with direct calls → Tasks 4–5.
- `createSupabaseClient` accepts a storage adapter → Task 1.
- Known re-derivation hazards folded in: `ensureSessionRecovered()` (Task 3) and direct `lastSyncTime` storage write (Task 3), which the offscreen→SW move otherwise reintroduces as the "auth lost after SW restart" and "sync timestamp not updating" bugs.
- Out of scope (belongs to #60 / #54, explicitly excluded): content-script-driven capture, `host_permissions`/`webNavigation`/`tabs` removal, `transitionType` changes, tab-based OAuth, Safari build.
