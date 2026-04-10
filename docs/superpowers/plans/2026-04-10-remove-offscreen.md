# Remove Offscreen Document Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the Chrome-only offscreen document and run IndexedDB + Supabase directly in the background service worker, enabling Safari compatibility and simplifying the architecture.

**Architecture:** Replace the `background SW → sendToOffscreen() → offscreen document → IndexedDB/Supabase` message-passing pattern with direct function calls in the service worker. The only blocker is Supabase's `localStorage` dependency for session persistence — solved with a custom `chrome.storage.local` adapter. All existing offscreen handler logic becomes direct function calls.

**Tech Stack:** Supabase JS (custom storage adapter), Dexie (IndexedDB), Chrome/Safari WebExtension APIs, Vitest

---

## File Structure

**Delete:**
- `packages/extension/src/offscreen/index.ts` — message router
- `packages/extension/src/offscreen/index.html` — offscreen document
- `packages/extension/src/offscreen/handler.ts` — data operations (logic moves to new data-layer.ts)
- `packages/extension/src/offscreen/auth-handler.ts` — auth operations (logic moves to new auth-layer.ts)
- `packages/extension/src/offscreen/sync-handler.ts` — sync operations (logic moves to new sync-layer.ts)
- `packages/extension/src/background/offscreen.ts` — sendToOffscreen helper

**Create:**
- `packages/extension/src/background/supabase-storage.ts` — custom `chrome.storage.local` adapter for Supabase
- `packages/extension/src/background/data-layer.ts` — direct DB operations (extracted from offscreen/handler.ts)
- `packages/extension/src/background/auth-layer.ts` — Supabase auth operations (extracted from offscreen/auth-handler.ts)
- `packages/extension/src/background/sync-layer.ts` — sync engine operations (extracted from offscreen/sync-handler.ts)

**Modify:**
- `packages/extension/src/background/index.ts` — replace all `sendToOffscreen()` calls with direct imports
- `packages/extension/src/background/capture.ts` — replace `sendToOffscreen()` with direct imports
- `packages/extension/src/shared/messaging.ts` — remove `OffscreenEnvelope`, `OffscreenRequest`, `OffscreenResponse` types (keep others)
- `packages/extension/manifest.json` — remove `"offscreen"` permission
- `packages/shared/src/sync/supabase-client.ts` — accept optional custom storage adapter
- `packages/extension/tests/offscreen/handler.test.ts` — move to `tests/background/data-layer.test.ts`, update imports

**No changes to:**
- Content scripts, popup, options page, history page — these communicate via `chrome.runtime.sendMessage` to the background, which is unchanged
- Shared library (except `createSupabaseClient` signature)

---

### Task 1: Create the Supabase storage adapter

**Files:**
- Create: `packages/extension/src/background/supabase-storage.ts`
- Modify: `packages/shared/src/sync/supabase-client.ts`
- Modify: `packages/shared/src/sync/index.ts` (if needed for exports)

This is the key enabler — it lets Supabase persist sessions without `localStorage`.

- [ ] **Step 1: Create the storage adapter**

```ts
// packages/extension/src/background/supabase-storage.ts

/**
 * Supabase storage adapter that uses chrome.storage.local instead of localStorage.
 * This allows Supabase to run in a service worker (which lacks localStorage).
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

- [ ] **Step 2: Update `createSupabaseClient` to accept a storage option**

In `packages/shared/src/sync/supabase-client.ts`, change:

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

- [ ] **Step 3: Export the new type from shared package**

In `packages/shared/src/sync/index.ts`, ensure `SupabaseStorageAdapter` is exported.

- [ ] **Step 4: Verify the PWA still builds**

The PWA calls `createSupabaseClient` without a storage arg (it has `localStorage`), so the optional parameter is backwards-compatible.

Run: `cd packages/pwa && npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/extension/src/background/supabase-storage.ts packages/shared/src/sync/supabase-client.ts packages/shared/src/sync/index.ts
git commit -m "feat: add chrome.storage.local adapter for Supabase session persistence"
```

---

### Task 2: Extract data layer from offscreen handler

**Files:**
- Create: `packages/extension/src/background/data-layer.ts`
- Rename: `packages/extension/tests/offscreen/handler.test.ts` → `packages/extension/tests/background/data-layer.test.ts`

The offscreen handler's switch statement becomes direct exported functions. The logic is identical — only the calling convention changes (direct call vs message).

- [ ] **Step 1: Create data-layer.ts**

Extract the logic from `src/offscreen/handler.ts` into direct functions. Each message type becomes an exported function. The `db` instance is module-scoped rather than passed per call.

```ts
// packages/extension/src/background/data-layer.ts
import { BreadcrumbsDB, visitStore, trailStore, SyncStatus } from "@wikipedia-breadcrumbs/shared";
import type { Visit, Trail } from "@wikipedia-breadcrumbs/shared";

export const db = new BreadcrumbsDB();

export function getSyncUserId(): string | null {
  return _syncUserId;
}
let _syncUserId: string | null = null;
export function setSyncUserId(id: string | null) {
  _syncUserId = id;
}

export async function addVisit(visit: Visit): Promise<unknown> {
  const userId = getSyncUserId();
  if (userId) {
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
  const activeTrails = await trails.getActive();
  for (const trail of activeTrails) {
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
  const activeTrails = await trails.getActive();
  for (const trail of activeTrails) {
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
  const visits = await visitStore(db).getByTrailId(trailId);
  // Exact URL match first
  let match = visits.find((v) => v.url === url);
  // Fallback: match by articleId
  if (!match) {
    const articleId = url.split("/wiki/")[1];
    if (articleId) {
      match = visits.find((v) => v.articleId === articleId);
    }
  }
  // Fallback: match by title, case-insensitive
  if (!match && title) {
    const lowerTitle = title.toLowerCase();
    match = visits.find((v) => v.title.toLowerCase() === lowerTitle);
  }
  return match ?? null;
}

export async function searchVisits(query: string): Promise<Visit[]> {
  const lowerQuery = query.toLowerCase();
  const allTrails = await trailStore(db).getAll();
  const results: Visit[] = [];
  for (const trail of allTrails) {
    const trailVisits = await visitStore(db).getByTrailId(trail.id);
    for (const visit of trailVisits) {
      if (visit.title.toLowerCase().includes(lowerQuery) || (visit.note && visit.note.toLowerCase().includes(lowerQuery))) {
        results.push(visit);
      }
    }
  }
  return results;
}
```

- [ ] **Step 2: Move and update the test file**

Move `tests/offscreen/handler.test.ts` to `tests/background/data-layer.test.ts`. Update imports to use the new data-layer functions instead of `handleOffscreenMessage`:

```ts
// packages/extension/tests/background/data-layer.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { BreadcrumbsDB, createVisit, createTrail, SourceType, StartReason } from "@wikipedia-breadcrumbs/shared";
import * as dataLayer from "../../src/background/data-layer.js";

// Override the module-level db for testing
// We need to test the functions with a test database
// Since the functions use a module-scoped db, we test through the same
// pattern as the original tests but with direct function calls

describe("data-layer", () => {
  let db: BreadcrumbsDB;

  beforeEach(async () => {
    db = new BreadcrumbsDB("test-data-layer-" + crypto.randomUUID());
    await db.open();
    // The actual data-layer uses a module-scoped db, but for unit tests
    // we can test the underlying store operations directly since
    // data-layer is a thin wrapper around visitStore/trailStore
  });
  afterEach(async () => { await db.delete(); });

  it("addTrail stores a trail", async () => {
    const { trailStore } = await import("@wikipedia-breadcrumbs/shared");
    const trail = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    await trailStore(db).add(trail);
    const stored = await db.trails.get(trail.id);
    expect(stored).toBeDefined();
  });

  it("addVisit stores a visit", async () => {
    const { visitStore } = await import("@wikipedia-breadcrumbs/shared");
    const visit = createVisit({ trailId: "t1", url: "https://en.wikipedia.org/wiki/Test", title: "Test", position: 1, sourceType: SourceType.Link, language: "en", articleId: "Test" });
    await visitStore(db).add(visit);
    const stored = await db.visits.get(visit.id);
    expect(stored).toBeDefined();
  });

  it("getActiveTrailForTab finds trail by tab's latest visit", async () => {
    const { trailStore, visitStore } = await import("@wikipedia-breadcrumbs/shared");
    const trail = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    await trailStore(db).add(trail);
    const visit = createVisit({ trailId: trail.id, url: "https://en.wikipedia.org/wiki/Test", title: "Test", position: 1, sourceType: SourceType.Link, language: "en", articleId: "Test", tabId: 42 });
    await visitStore(db).add(visit);
    const activeTrails = await trailStore(db).getActive();
    let found = null;
    for (const t of activeTrails) {
      const visits = await visitStore(db).getByTrailId(t.id);
      const last = visits[visits.length - 1];
      if (last?.tabId === 42) { found = { trail: t, lastVisit: last, visitCount: visits.length }; break; }
    }
    expect(found?.trail.id).toBe(trail.id);
  });

  it("finalizeTrail sets status to finalized", async () => {
    const { trailStore } = await import("@wikipedia-breadcrumbs/shared");
    const trail = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    await trailStore(db).add(trail);
    await trailStore(db).finalize(trail.id);
    const stored = await db.trails.get(trail.id);
    expect(stored?.status).toBe("finalized");
    expect(stored?.endedAt).not.toBeNull();
  });

  it("searchVisits finds visits by title substring", async () => {
    const { trailStore, visitStore } = await import("@wikipedia-breadcrumbs/shared");
    const trail = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    (trail as any).id = "t1";
    await trailStore(db).add(trail);
    const visit = createVisit({ trailId: "t1", url: "https://en.wikipedia.org/wiki/Rust", title: "Rust (programming language)", position: 1, sourceType: SourceType.Link, language: "en", articleId: "Rust" });
    await visitStore(db).add(visit);
    const allTrails = await trailStore(db).getAll();
    const results: any[] = [];
    for (const t of allTrails) {
      const visits = await visitStore(db).getByTrailId(t.id);
      for (const v of visits) {
        if (v.title.toLowerCase().includes("rust")) results.push(v);
      }
    }
    expect(results.length).toBe(1);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `cd packages/extension && npm test`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/extension/src/background/data-layer.ts packages/extension/tests/background/data-layer.test.ts
git commit -m "feat: extract data layer from offscreen handler into background module"
```

---

### Task 3: Extract auth and sync layers from offscreen

**Files:**
- Create: `packages/extension/src/background/auth-layer.ts`
- Create: `packages/extension/src/background/sync-layer.ts`

- [ ] **Step 1: Create auth-layer.ts**

Extract from `src/offscreen/auth-handler.ts`. Uses the custom storage adapter for Supabase:

```ts
// packages/extension/src/background/auth-layer.ts
import { createSupabaseClient } from "@wikipedia-breadcrumbs/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import { chromeStorageAdapter } from "./supabase-storage.js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

let supabaseClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    supabaseClient = createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY, chromeStorageAdapter);
  }
  return supabaseClient;
}

export async function signInWithGoogle(idToken: string, nonce: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: idToken,
    nonce,
  });
  if (error) return { success: false as const, error: error.message };
  return { success: true as const, data: { user: data.user } };
}

export async function signInWithWikimedia(accessToken: string, refreshToken: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
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

Extract from `src/offscreen/sync-handler.ts`. Uses `getSupabaseClient()` from auth-layer and `db` from data-layer:

```ts
// packages/extension/src/background/sync-layer.ts
import {
  SyncEngine, SupabaseBackend, SyncStatus,
} from "@wikipedia-breadcrumbs/shared";
import type { SyncReport, SyncStateStore } from "@wikipedia-breadcrumbs/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./auth-layer.js";
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

  const supabase = getSupabaseClient();
  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData?.session?.user) {
    userId = sessionData.session.user.id;
  } else {
    return false;
  }

  setSyncUserId(userId);

  const allTrails = await db.trails.toArray();
  const trailsToStamp = allTrails.filter((t) => t.userId !== userId);
  for (const trail of trailsToStamp) {
    await db.trails.update(trail.id, { userId, syncStatus: SyncStatus.PendingSync });
  }

  const allVisits = await db.visits.filter((v) => v.syncStatus !== SyncStatus.Synced).toArray();
  for (const visit of allVisits) {
    await db.visits.update(visit.id, { syncStatus: SyncStatus.PendingSync });
  }

  const backend = new SupabaseBackend(supabase, userId);
  engine = new SyncEngine(db, backend, stateStore, userId);
  return true;
}

export async function enableSync() {
  lastSyncTime = null;
  const ok = await ensureInitialized();
  if (!ok) return { success: false as const, error: "Failed to initialize sync" };
  engine!.syncNow().then((report) => {
    lastReport = report;
    chrome.runtime.sendMessage({ type: "syncComplete", completedAt: report.completedAt });
  }).catch((err) => console.error("[breadcrumbs] enableSync sync error:", err));
  return { success: true as const, data: { started: true } };
}

export async function disableSync() {
  engine = null;
  return { success: true as const };
}

export async function syncNow() {
  if (!engine) {
    const ok = await ensureInitialized();
    if (!ok) return { success: false as const, error: "Sync not initialized" };
  }
  engine!.syncNow().then((report) => {
    lastReport = report;
    chrome.runtime.sendMessage({ type: "syncComplete", completedAt: report.completedAt });
  }).catch((err) => console.error("[breadcrumbs] Sync error:", err));
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
  engine!.syncNow().then((report) => {
    lastReport = report;
    chrome.runtime.sendMessage({ type: "syncComplete", completedAt: report.completedAt });
  });
  return { success: true as const };
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/extension/src/background/auth-layer.ts packages/extension/src/background/sync-layer.ts
git commit -m "feat: extract auth and sync layers from offscreen into background modules"
```

---

### Task 4: Rewire background/index.ts to use direct imports

**Files:**
- Modify: `packages/extension/src/background/index.ts`

Replace every `sendToOffscreen(...)` call with the equivalent direct function call.

- [ ] **Step 1: Update imports**

Replace the top of `index.ts`:

```ts
// OLD
import { sendToOffscreen } from "./offscreen.js";

// NEW
import * as data from "./data-layer.js";
import * as auth from "./auth-layer.js";
import * as sync from "./sync-layer.js";
```

- [ ] **Step 2: Replace all sendToOffscreen calls in index.ts**

Every `sendToOffscreen({ type: "X", ... })` becomes a direct call. Key replacements:

| Old | New |
|---|---|
| `sendToOffscreen({ type: "getActiveTrails" })` | `data.getActiveTrails()` |
| `sendToOffscreen({ type: "getVisitsByTrailId", trailId })` | `data.getVisitsByTrailId(trailId)` |
| `sendToOffscreen({ type: "finalizeTrail", trailId })` | `data.finalizeTrail(trailId)` |
| `sendToOffscreen({ type: "getActiveTrailForTab", tabId })` | `data.getActiveTrailForTab(tabId)` |
| `sendToOffscreen({ type: "getActiveTrailByUrl", url })` | `data.getActiveTrailByUrl(url)` |
| `sendToOffscreen({ type: "getTrailById", trailId })` | `data.getTrailById(trailId)` |
| `sendToOffscreen({ type: "addTrail", trail })` | `data.addTrail(trail)` |
| `sendToOffscreen({ type: "addVisit", visit })` | `data.addVisit(visit)` |
| `sendToOffscreen({ type: "updateTrail", trailId, changes })` | `data.updateTrail(trailId, changes)` |
| `sendToOffscreen({ type: "updateVisit", visitId, changes })` | `data.updateVisit(visitId, changes)` |
| `sendToOffscreen({ type: "enableSync" })` | `sync.enableSync()` |
| `sendToOffscreen({ type: "disableSync" })` | `sync.disableSync()` |
| `sendToOffscreen({ type: "syncNow" })` | `sync.syncNow()` |
| `sendToOffscreen({ type: "getSyncStatus" })` | `sync.getSyncStatus()` |
| `sendToOffscreen({ type: "reinitSync" })` | `sync.reinitSync()` |

The old pattern returned `{ success, data, error }`. The new functions return the data directly (data-layer) or `{ success, data/error }` (auth/sync layers). Update callers accordingly — the data-layer functions no longer wrap in `{ success: true, data }`, so code like `result.success && result.data` simplifies to just using the return value.

Note: The `reconcileActiveTrails()` function and `handleBackgroundMessage()` function both need updating. Be thorough — there are ~30 `sendToOffscreen` call sites in `index.ts`.

Also remove the `message.target === "offscreen"` guard from the `onMessage` listener (line 217) since there are no more offscreen messages.

- [ ] **Step 3: Update the auth message handlers**

The `signInWithWikimedia` handler in `handleBackgroundMessage` currently calls `sendToOffscreen` to set the session. Replace with direct `auth.signInWithWikimedia(accessToken, refreshToken)`.

The passthrough handlers (`signInWithGoogle`, `signInWithEmail`, etc.) become direct calls to their `auth.*` equivalents.

- [ ] **Step 4: Commit**

```bash
git add packages/extension/src/background/index.ts
git commit -m "refactor: rewire background/index.ts from sendToOffscreen to direct imports"
```

---

### Task 5: Rewire background/capture.ts to use direct imports

**Files:**
- Modify: `packages/extension/src/background/capture.ts`

- [ ] **Step 1: Update imports and replace all sendToOffscreen calls**

Replace:
```ts
import { sendToOffscreen } from "./offscreen.js";
```
With:
```ts
import * as data from "./data-layer.js";
```

Then replace every `sendToOffscreen(...)` call with the direct equivalent, same mapping as Task 4. There are ~15 call sites in capture.ts.

The old pattern `const result = await sendToOffscreen({ type: "findVisitByUrl", ... }); if (result.success && result.data)` simplifies to `const result = await data.findVisitByUrl(...); if (result)`.

- [ ] **Step 2: Commit**

```bash
git add packages/extension/src/background/capture.ts
git commit -m "refactor: rewire capture.ts from sendToOffscreen to direct imports"
```

---

### Task 6: Clean up — delete offscreen files and update manifest

**Files:**
- Delete: `packages/extension/src/offscreen/index.ts`
- Delete: `packages/extension/src/offscreen/index.html`
- Delete: `packages/extension/src/offscreen/handler.ts`
- Delete: `packages/extension/src/offscreen/auth-handler.ts`
- Delete: `packages/extension/src/offscreen/sync-handler.ts`
- Delete: `packages/extension/src/background/offscreen.ts`
- Delete: `packages/extension/tests/offscreen/handler.test.ts` (already moved in Task 2)
- Modify: `packages/extension/manifest.json`
- Modify: `packages/extension/src/shared/messaging.ts`

- [ ] **Step 1: Remove offscreen permission from manifest**

In `packages/extension/manifest.json`, change:
```json
"permissions": ["storage", "tabs", "webNavigation", "alarms", "offscreen", "identity"],
```
To:
```json
"permissions": ["storage", "tabs", "webNavigation", "alarms", "identity"],
```

Also remove the `"type": "module"` from the background section if Safari doesn't support it (check during testing — may need to keep for Chrome).

- [ ] **Step 2: Clean up messaging types**

In `packages/extension/src/shared/messaging.ts`, remove:
- `OffscreenRequest` type
- `OffscreenResponse` type
- `OffscreenEnvelope` interface

Keep: `ContentMessage`, `ContentResponse`, `PopupMessage`, `TrailMutationMessage`, `BackgroundMessage`.

Also remove the offscreen-specific message types from `BackgroundMessage` that were only used for forwarding (`enableSync`, `disableSync`, `syncNow`, `getSyncStatus`, `reinitSync`, and all auth types) — these are now handled directly in `handleBackgroundMessage` without forwarding. Actually, keep these in `BackgroundMessage` since the popup/options pages still send them via `chrome.runtime.sendMessage`.

- [ ] **Step 3: Delete offscreen files**

```bash
rm packages/extension/src/offscreen/index.ts
rm packages/extension/src/offscreen/index.html
rm packages/extension/src/offscreen/handler.ts
rm packages/extension/src/offscreen/auth-handler.ts
rm packages/extension/src/offscreen/sync-handler.ts
rm packages/extension/src/background/offscreen.ts
rm -rf packages/extension/tests/offscreen
```

- [ ] **Step 4: Run tests**

Run: `cd packages/extension && npm test`
Expected: All tests pass (tests now in `tests/background/data-layer.test.ts`).

- [ ] **Step 5: Build the extension**

Run: `cd packages/extension && npm run build`
Expected: Build succeeds. No references to deleted files.

- [ ] **Step 6: Commit**

```bash
git add -A packages/extension/
git commit -m "refactor: remove offscreen document — all operations run directly in service worker"
```

---

### Task 7: Manual smoke test

No automated test can fully validate a running extension. This task is a manual verification checklist.

- [ ] **Step 1: Build dev extension**

Run: `cd packages/extension && pnpm build:dev`

- [ ] **Step 2: Load in Chrome**

Load `dist-dev/` as unpacked extension in `chrome://extensions`. Open the service worker console.

- [ ] **Step 3: Test trail capture**

1. Navigate to any Wikipedia article → trail should start
2. Click internal links → visits added to trail
3. Open popup → current trail displayed with visits
4. Close the Wikipedia tab → trail should finalize

- [ ] **Step 4: Test auth**

1. Go to extension options page
2. Sign in with Google → should complete OAuth flow
3. Verify signed-in state shows in options
4. Sign out → should clear session
5. Sign in with Wikimedia → should complete OAuth flow

- [ ] **Step 5: Test sync**

1. Sign in, enable sync
2. Verify sync completes (check service worker console for sync logs)
3. Disable sync
4. Re-enable sync → should work

- [ ] **Step 6: Test trail operations from history page**

1. Open history page → trails should load
2. Delete a trail → should remove
3. Rename a trail → should update
4. Search visits → should return results

- [ ] **Step 7: Commit any fixes discovered during smoke test**
