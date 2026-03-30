# Chrome Extension Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local-only Chrome extension that captures Wikipedia browsing history as breadcrumb trails with popup, history, and options pages.

**Architecture:** MV3 extension with a background service worker that captures navigation events, a content script for link click context, an offscreen document for IndexedDB access, and three Svelte 5 UI pages (popup, history, options). All data stored locally via `@wikipedia-breadcrumbs/shared` Dexie layer.

**Tech Stack:** TypeScript, Svelte 5, Vite, vite-plugin-web-extension, Chrome Extensions MV3, Vitest

**Spec reference:** `docs/superpowers/specs/2026-03-30-chrome-extension-phase1-design.md`

---

## Chunk 1: Extension Package Scaffold + Shared Modules

### Task 1: Extension Package Scaffold

**Files:**
- Create: `packages/extension/package.json`
- Create: `packages/extension/tsconfig.json`
- Create: `packages/extension/manifest.json`
- Create: `packages/extension/static/icons/icon-16.png`
- Create: `packages/extension/static/icons/icon-48.png`
- Create: `packages/extension/static/icons/icon-128.png`

- [ ] **Step 1: Create `packages/extension/package.json`**

```json
{
  "name": "@wikipedia-breadcrumbs/extension",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite build --watch --mode development",
    "build": "vite build",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@wikipedia-breadcrumbs/shared": "workspace:*"
  },
  "devDependencies": {
    "@sveltejs/vite-plugin-svelte": "^5.0.0",
    "fake-indexeddb": "^6.0.0",
    "svelte": "^5.0.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0",
    "vite-plugin-web-extension": "^4.0.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: Create `packages/extension/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "types": ["chrome"]
  },
  "include": ["src/**/*.ts", "src/**/*.svelte"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Create `packages/extension/manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "Wikipedia Breadcrumbs",
  "version": "0.1.0",
  "description": "Track your Wikipedia browsing trails",
  "permissions": ["storage", "tabs", "webNavigation", "alarms", "offscreen"],
  "host_permissions": ["*://*.wikipedia.org/*"],
  "background": {
    "service_worker": "src/background/index.ts",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["*://*.wikipedia.org/wiki/*"],
      "js": ["src/content/index.ts"],
      "run_at": "document_idle"
    }
  ],
  "action": {
    "default_popup": "src/popup/index.html",
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
  "options_page": "src/options/index.html"
}
```

Note: The manifest references `src/` paths — `vite-plugin-web-extension` rewrites these to `dist/` paths during build.

- [ ] **Step 4: Create placeholder icon files**

Create 1x1 pixel placeholder PNGs at:
- `packages/extension/static/icons/icon-16.png`
- `packages/extension/static/icons/icon-48.png`
- `packages/extension/static/icons/icon-128.png`

Use this command to generate them:
```bash
mkdir -p packages/extension/static/icons
for size in 16 48 128; do
  printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82' > packages/extension/static/icons/icon-${size}.png
done
```

- [ ] **Step 5: Install dependencies from repo root**

Run: `pnpm install`
Expected: All dependencies resolve

- [ ] **Step 6: Commit**

```bash
git add packages/extension/package.json packages/extension/tsconfig.json packages/extension/manifest.json packages/extension/static/ pnpm-lock.yaml
git commit -m "chore: scaffold extension package with manifest and icons"
```

---

### Task 2: Vite Build Configuration

**Files:**
- Create: `packages/extension/vite.config.ts`
- Create: `packages/extension/src/background/index.ts` (placeholder)
- Create: `packages/extension/src/content/index.ts` (placeholder)
- Create: `packages/extension/src/popup/index.html` (placeholder)
- Create: `packages/extension/src/popup/main.ts` (placeholder)
- Create: `packages/extension/src/options/index.html` (placeholder)
- Create: `packages/extension/src/options/main.ts` (placeholder)
- Create: `packages/extension/src/offscreen/index.html` (placeholder)
- Create: `packages/extension/src/offscreen/index.ts` (placeholder)

- [ ] **Step 1: Create `packages/extension/vite.config.ts`**

```typescript
/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import webExtension from "vite-plugin-web-extension";

export default defineConfig({
  plugins: [
    svelte(),
    webExtension({
      manifest: "manifest.json",
      additionalInputs: ["src/offscreen/index.html"],
    }),
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  test: {
    globals: true,
    setupFiles: ["./tests/setup.ts"],
  },
});
```

- [ ] **Step 2: Create test setup**

```typescript
// packages/extension/tests/setup.ts
import "fake-indexeddb/auto";
```

- [ ] **Step 3: Create placeholder entry files**

Create minimal placeholder files so the build can run:

```typescript
// packages/extension/src/background/index.ts
console.log("Wikipedia Breadcrumbs background service worker loaded");
```

```typescript
// packages/extension/src/content/index.ts
console.log("Wikipedia Breadcrumbs content script loaded");
```

```html
<!-- packages/extension/src/popup/index.html -->
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Wikipedia Breadcrumbs</title></head>
<body><div id="app"></div><script type="module" src="./main.ts"></script></body>
</html>
```

```typescript
// packages/extension/src/popup/main.ts
document.getElementById("app")!.textContent = "Wikipedia Breadcrumbs Popup";
```

```html
<!-- packages/extension/src/options/index.html -->
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Wikipedia Breadcrumbs Options</title></head>
<body><div id="app"></div><script type="module" src="./main.ts"></script></body>
</html>
```

```typescript
// packages/extension/src/options/main.ts
document.getElementById("app")!.textContent = "Wikipedia Breadcrumbs Options";
```

```html
<!-- packages/extension/src/offscreen/index.html -->
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Offscreen</title></head>
<body><script type="module" src="./index.ts"></script></body>
</html>
```

```typescript
// packages/extension/src/offscreen/index.ts
console.log("Offscreen document loaded");
```

- [ ] **Step 4: Verify build works**

Run: `cd packages/extension && pnpm build`
Expected: `dist/` directory created with manifest.json and compiled files

If `vite-plugin-web-extension` has compatibility issues, fall back to manual Rollup input config:
```typescript
// Fallback vite.config.ts approach
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { resolve } from "path";
import { copyFileSync, mkdirSync } from "fs";

export default defineConfig({
  plugins: [svelte()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        background: resolve(__dirname, "src/background/index.ts"),
        content: resolve(__dirname, "src/content/index.ts"),
        popup: resolve(__dirname, "src/popup/index.html"),
        options: resolve(__dirname, "src/options/index.html"),
        offscreen: resolve(__dirname, "src/offscreen/index.html"),
      },
      output: {
        entryFileNames: "[name]/index.js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
```

- [ ] **Step 5: Commit**

```bash
git add packages/extension/vite.config.ts packages/extension/src/ packages/extension/tests/
git commit -m "chore: add Vite build config and placeholder entries"
```

---

### Task 3: Type-Safe Messaging Module

**Files:**
- Create: `packages/extension/src/shared/messaging.ts`
- Test: `packages/extension/tests/shared/messaging.test.ts`

This module defines all message types and provides type-safe wrappers for `chrome.runtime.sendMessage` and `chrome.tabs.sendMessage`.

- [ ] **Step 1: Write the test**

```typescript
// packages/extension/tests/shared/messaging.test.ts
import { describe, it, expect } from "vitest";
import type {
  OffscreenRequest,
  OffscreenResponse,
  ContentMessage,
  ContentResponse,
  PopupMessage,
  TrailMutationMessage,
} from "../../src/shared/messaging.js";

describe("messaging types", () => {
  it("OffscreenRequest type covers all DB operations", () => {
    const addVisit: OffscreenRequest = {
      type: "addVisit",
      visit: {} as any,
    };
    const addTrail: OffscreenRequest = {
      type: "addTrail",
      trail: {} as any,
    };
    const finalizeTrail: OffscreenRequest = {
      type: "finalizeTrail",
      trailId: "abc",
    };
    const getActive: OffscreenRequest = {
      type: "getActiveTrailForTab",
      tabId: 1,
    };
    const getAll: OffscreenRequest = { type: "getTrailsAll" };
    const getById: OffscreenRequest = {
      type: "getTrailById",
      trailId: "abc",
    };
    const getVisits: OffscreenRequest = {
      type: "getVisitsByTrailId",
      trailId: "abc",
    };
    const updateTrail: OffscreenRequest = {
      type: "updateTrail",
      trailId: "abc",
      changes: {},
    };
    const updateVisit: OffscreenRequest = {
      type: "updateVisit",
      visitId: "abc",
      changes: {},
    };
    const softDelete: OffscreenRequest = {
      type: "softDeleteTrail",
      trailId: "abc",
    };
    const search: OffscreenRequest = {
      type: "searchVisits",
      query: "rust",
    };

    // Type check passes if this compiles
    expect(addVisit.type).toBe("addVisit");
    expect(getAll.type).toBe("getTrailsAll");
  });

  it("ContentMessage types are defined", () => {
    const getClick: ContentMessage = { type: "getClickContext" };
    const ping: ContentMessage = { type: "ping" };
    expect(getClick.type).toBe("getClickContext");
    expect(ping.type).toBe("ping");
  });

  it("PopupMessage types are defined", () => {
    const getCurrent: PopupMessage = { type: "getCurrentTrail", tabId: 1 };
    const startNew: PopupMessage = { type: "startNewTrail", tabId: 1 };
    const end: PopupMessage = { type: "endTrail", trailId: "abc" };
    const rename: PopupMessage = {
      type: "renameTrail",
      trailId: "abc",
      name: "test",
    };
    expect(getCurrent.type).toBe("getCurrentTrail");
  });

  it("TrailMutationMessage types are defined", () => {
    const mutated: TrailMutationMessage = {
      type: "trailMutated",
      trailId: "abc",
    };
    const deleted: TrailMutationMessage = {
      type: "trailDeleted",
      trailId: "abc",
    };
    expect(mutated.type).toBe("trailMutated");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/extension && pnpm test -- tests/shared/messaging.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement messaging types**

```typescript
// packages/extension/src/shared/messaging.ts
import type { Visit, Trail } from "@wikipedia-breadcrumbs/shared";

// === Offscreen (background <-> offscreen document) ===

export type OffscreenRequest =
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

export type OffscreenResponse<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string };

// === Content script (background <-> content) ===

export type ContentMessage =
  | { type: "getClickContext" }
  | { type: "ping" };

export type ContentResponse =
  | { clickedLinkText: string | null; referrerUrl: string | null }
  | { pong: true };

// === Popup (popup <-> background) ===

export type PopupMessage =
  | { type: "getCurrentTrail"; tabId: number }
  | { type: "startNewTrail"; tabId: number }
  | { type: "endTrail"; trailId: string }
  | { type: "renameTrail"; trailId: string; name: string };

// === Background state invalidation (UI pages -> background) ===

export type TrailMutationMessage =
  | { type: "trailMutated"; trailId: string }
  | { type: "trailDeleted"; trailId: string };

// All messages that the background listener handles
export type BackgroundMessage = PopupMessage | TrailMutationMessage;

// Wrapper for offscreen messages — includes target discriminator to avoid
// routing collision with background's onMessage listener
export interface OffscreenEnvelope {
  target: "offscreen";
  request: OffscreenRequest;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/extension && pnpm test -- tests/shared/messaging.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/extension/src/shared/messaging.ts packages/extension/tests/shared/messaging.test.ts
git commit -m "feat(extension): add type-safe messaging module"
```

---

### Task 4: Settings Module

**Files:**
- Create: `packages/extension/src/shared/settings.ts`
- Test: `packages/extension/tests/shared/settings.test.ts`
- Create: `packages/extension/tests/chrome-mock.ts`

- [ ] **Step 1: Create Chrome API mock for tests**

```typescript
// packages/extension/tests/chrome-mock.ts
import { vi } from "vitest";

const storage = new Map<string, unknown>();

export const chromeMock = {
  storage: {
    local: {
      get: vi.fn(async (keys: string | string[]) => {
        const keyList = typeof keys === "string" ? [keys] : keys;
        const result: Record<string, unknown> = {};
        for (const key of keyList) {
          if (storage.has(key)) result[key] = storage.get(key);
        }
        return result;
      }),
      set: vi.fn(async (items: Record<string, unknown>) => {
        for (const [key, value] of Object.entries(items)) {
          storage.set(key, value);
        }
      }),
    },
    onChanged: {
      addListener: vi.fn(),
    },
  },
  runtime: {
    sendMessage: vi.fn(),
  },
  tabs: {
    sendMessage: vi.fn(),
  },
  alarms: {
    create: vi.fn(),
    clear: vi.fn(),
    onAlarm: { addListener: vi.fn() },
  },
  webNavigation: {
    onCompleted: { addListener: vi.fn() },
  },
  offscreen: {
    createDocument: vi.fn(),
    hasDocument: vi.fn(async () => false),
    Reason: { WORKERS: "WORKERS" },
  },
};

export function installChromeMock() {
  (globalThis as any).chrome = chromeMock;
}

export function resetChromeMock() {
  storage.clear();
  vi.clearAllMocks();
}
```

- [ ] **Step 2: Update test setup to install chrome mock**

```typescript
// packages/extension/tests/setup.ts
import "fake-indexeddb/auto";
import { installChromeMock } from "./chrome-mock.js";

installChromeMock();
```

- [ ] **Step 3: Write the settings test**

```typescript
// packages/extension/tests/shared/settings.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { resetChromeMock } from "../chrome-mock.js";
import { getSettings, updateSettings, DEFAULTS } from "../../src/shared/settings.js";

describe("settings", () => {
  beforeEach(() => {
    resetChromeMock();
  });

  it("getSettings returns defaults when nothing stored", async () => {
    const settings = await getSettings();
    expect(settings).toEqual(DEFAULTS);
  });

  it("getSettings merges stored values with defaults", async () => {
    await chrome.storage.local.set({ idleTimeoutMinutes: 15 });
    const settings = await getSettings();
    expect(settings.idleTimeoutMinutes).toBe(15);
    expect(settings.captureEnabled).toBe(true);
  });

  it("updateSettings persists partial updates", async () => {
    await updateSettings({ captureEnabled: false });
    const settings = await getSettings();
    expect(settings.captureEnabled).toBe(false);
    expect(settings.idleTimeoutMinutes).toBe(30);
  });

  it("DEFAULTS has expected values", () => {
    expect(DEFAULTS.idleTimeoutMinutes).toBe(30);
    expect(DEFAULTS.captureEnabled).toBe(true);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd packages/extension && pnpm test -- tests/shared/settings.test.ts`
Expected: FAIL — module not found

- [ ] **Step 5: Implement settings module**

```typescript
// packages/extension/src/shared/settings.ts

export interface ExtensionSettings {
  idleTimeoutMinutes: number;
  captureEnabled: boolean;
}

export const DEFAULTS: ExtensionSettings = {
  idleTimeoutMinutes: 30,
  captureEnabled: true,
};

const KEYS = Object.keys(DEFAULTS) as (keyof ExtensionSettings)[];

export async function getSettings(): Promise<ExtensionSettings> {
  const stored = await chrome.storage.local.get(KEYS);
  return { ...DEFAULTS, ...stored } as ExtensionSettings;
}

export async function updateSettings(
  changes: Partial<ExtensionSettings>
): Promise<void> {
  await chrome.storage.local.set(changes);
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd packages/extension && pnpm test -- tests/shared/settings.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/extension/src/shared/settings.ts packages/extension/tests/shared/settings.test.ts packages/extension/tests/chrome-mock.ts packages/extension/tests/setup.ts
git commit -m "feat(extension): add settings module with chrome.storage.local"
```

---

### Task 5: Device ID Module

**Files:**
- Create: `packages/extension/src/shared/device-id.ts`
- Test: `packages/extension/tests/shared/device-id.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// packages/extension/tests/shared/device-id.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { resetChromeMock } from "../chrome-mock.js";
import { getDeviceId } from "../../src/shared/device-id.js";

describe("getDeviceId", () => {
  beforeEach(() => {
    resetChromeMock();
  });

  it("generates and persists a new UUID on first call", async () => {
    const id = await getDeviceId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ deviceId: id });
  });

  it("returns stored ID on subsequent calls", async () => {
    await chrome.storage.local.set({ deviceId: "existing-id" });
    const id = await getDeviceId();
    expect(id).toBe("existing-id");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/extension && pnpm test -- tests/shared/device-id.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement device ID module**

```typescript
// packages/extension/src/shared/device-id.ts

export async function getDeviceId(): Promise<string> {
  const { deviceId } = await chrome.storage.local.get("deviceId");
  if (deviceId) return deviceId as string;

  const newId = crypto.randomUUID();
  await chrome.storage.local.set({ deviceId: newId });
  return newId;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/extension && pnpm test -- tests/shared/device-id.test.ts`
Expected: PASS

- [ ] **Step 5: Run all tests**

Run: `cd packages/extension && pnpm test`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add packages/extension/src/shared/device-id.ts packages/extension/tests/shared/device-id.test.ts
git commit -m "feat(extension): add device ID generation and persistence"
```

---

## Chunk 2: Offscreen Proxy + Background Service Worker

### Task 6: Offscreen Document Handler

**Files:**
- Modify: `packages/extension/src/offscreen/index.ts`
- Test: `packages/extension/tests/offscreen/handler.test.ts`

The offscreen document receives messages and performs DB operations using the shared lib.

- [ ] **Step 1: Write the test**

```typescript
// packages/extension/tests/offscreen/handler.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  BreadcrumbsDB,
  createVisit,
  createTrail,
  SourceType,
  StartReason,
} from "@wikipedia-breadcrumbs/shared";
import { handleOffscreenMessage } from "../../src/offscreen/handler.js";
import type { OffscreenRequest } from "../../src/shared/messaging.js";

describe("handleOffscreenMessage", () => {
  let db: BreadcrumbsDB;

  beforeEach(async () => {
    db = new BreadcrumbsDB("test-offscreen-" + crypto.randomUUID());
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it("addTrail stores a trail", async () => {
    const trail = createTrail({
      startReason: StartReason.AutoNewTab,
      deviceId: "d1",
    });
    const result = await handleOffscreenMessage(db, {
      type: "addTrail",
      trail,
    });
    expect(result.success).toBe(true);
  });

  it("addVisit stores a visit", async () => {
    const visit = createVisit({
      trailId: "t1",
      url: "https://en.wikipedia.org/wiki/Test",
      title: "Test",
      position: 1,
      sourceType: SourceType.Link,
      language: "en",
      articleId: "Test",
    });
    const result = await handleOffscreenMessage(db, {
      type: "addVisit",
      visit,
    });
    expect(result.success).toBe(true);
  });

  it("getTrailsAll returns all non-deleted trails", async () => {
    const trail = createTrail({
      startReason: StartReason.AutoNewTab,
      deviceId: "d1",
    });
    await db.trails.add(trail);

    const result = await handleOffscreenMessage(db, { type: "getTrailsAll" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as any[]).length).toBe(1);
    }
  });

  it("getActiveTrailForTab finds trail by tab's latest visit", async () => {
    const trail = createTrail({
      startReason: StartReason.AutoNewTab,
      deviceId: "d1",
    });
    await db.trails.add(trail);

    const visit = createVisit({
      trailId: trail.id,
      url: "https://en.wikipedia.org/wiki/Test",
      title: "Test",
      position: 1,
      sourceType: SourceType.Link,
      language: "en",
      articleId: "Test",
      tabId: 42,
    });
    await db.visits.add(visit);

    const result = await handleOffscreenMessage(db, {
      type: "getActiveTrailForTab",
      tabId: 42,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as any)?.trail.id).toBe(trail.id);
    }
  });

  it("getActiveTrailForTab returns null for unknown tab", async () => {
    const result = await handleOffscreenMessage(db, {
      type: "getActiveTrailForTab",
      tabId: 999,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBeNull();
    }
  });

  it("finalizeTrail sets status to finalized", async () => {
    const trail = createTrail({
      startReason: StartReason.AutoNewTab,
      deviceId: "d1",
    });
    await db.trails.add(trail);

    await handleOffscreenMessage(db, {
      type: "finalizeTrail",
      trailId: trail.id,
    });

    const stored = await db.trails.get(trail.id);
    expect(stored?.status).toBe("finalized");
    expect(stored?.endedAt).not.toBeNull();
  });

  it("searchVisits finds visits by title substring", async () => {
    const visit = createVisit({
      trailId: "t1",
      url: "https://en.wikipedia.org/wiki/Rust",
      title: "Rust (programming language)",
      position: 1,
      sourceType: SourceType.Link,
      language: "en",
      articleId: "Rust",
    });
    await db.visits.add(visit);

    const result = await handleOffscreenMessage(db, {
      type: "searchVisits",
      query: "rust",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as any[]).length).toBe(1);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/extension && pnpm test -- tests/offscreen/handler.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the offscreen handler**

```typescript
// packages/extension/src/offscreen/handler.ts
import {
  BreadcrumbsDB,
  visitStore,
  trailStore,
  TrailStatus,
} from "@wikipedia-breadcrumbs/shared";
import type { Visit, Trail } from "@wikipedia-breadcrumbs/shared";
import type {
  OffscreenRequest,
  OffscreenResponse,
} from "../shared/messaging.js";

export async function handleOffscreenMessage(
  db: BreadcrumbsDB,
  message: OffscreenRequest
): Promise<OffscreenResponse> {
  const visits = visitStore(db);
  const trails = trailStore(db);

  try {
    switch (message.type) {
      case "addVisit": {
        const result = await visits.add(message.visit);
        return { success: true, data: result };
      }
      case "addTrail": {
        const result = await trails.add(message.trail);
        return { success: true, data: result };
      }
      case "finalizeTrail": {
        const result = await trails.finalize(message.trailId);
        return { success: true, data: result };
      }
      case "getActiveTrailForTab": {
        const activeTrails = await trails.getActive();
        for (const trail of activeTrails) {
          const trailVisits = await visits.getByTrailId(trail.id);
          const lastVisit = trailVisits[trailVisits.length - 1];
          if (lastVisit?.tabId === message.tabId) {
            return {
              success: true,
              data: { trail, lastVisit, visitCount: trailVisits.length },
            };
          }
        }
        return { success: true, data: null };
      }
      case "getTrailsAll": {
        const result = await trails.getAll();
        return { success: true, data: result };
      }
      case "getTrailById": {
        const result = await trails.getById(message.trailId);
        return { success: true, data: result };
      }
      case "getVisitsByTrailId": {
        const result = await visits.getByTrailId(message.trailId);
        return { success: true, data: result };
      }
      case "updateTrail": {
        const result = await trails.update(message.trailId, message.changes);
        return { success: true, data: result };
      }
      case "updateVisit": {
        const result = await visits.update(message.visitId, message.changes);
        return { success: true, data: result };
      }
      case "softDeleteTrail": {
        await trails.softDelete(message.trailId);
        return { success: true, data: null };
      }
      case "searchVisits": {
        const query = message.query.toLowerCase();
        const allTrailsList = await trails.getAll();
        const results: Visit[] = [];
        for (const trail of allTrailsList) {
          const trailVisits = await visits.getByTrailId(trail.id);
          for (const visit of trailVisits) {
            if (
              visit.title.toLowerCase().includes(query) ||
              (visit.note && visit.note.toLowerCase().includes(query))
            ) {
              results.push(visit);
            }
          }
        }
        return { success: true, data: results };
      }
      default: {
        const _exhaustive: never = message;
        return { success: false, error: `Unknown message type: ${(message as any).type}` };
      }
    }
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
```

- [ ] **Step 4: Update offscreen entry to wire up messaging**

```typescript
// packages/extension/src/offscreen/index.ts
import { BreadcrumbsDB } from "@wikipedia-breadcrumbs/shared";
import { handleOffscreenMessage } from "./handler.js";
import type { OffscreenEnvelope } from "../shared/messaging.js";

const db = new BreadcrumbsDB();

chrome.runtime.onMessage.addListener(
  (message: OffscreenEnvelope, _sender, sendResponse) => {
    // Only handle messages targeted at offscreen document
    if (message.target !== "offscreen") return false;
    handleOffscreenMessage(db, message.request).then(sendResponse);
    return true; // Keep message channel open for async response
  }
);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/extension && pnpm test -- tests/offscreen/handler.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/extension/src/offscreen/ packages/extension/tests/offscreen/
git commit -m "feat(extension): add offscreen IndexedDB proxy handler"
```

---

### Task 7: Background Offscreen Client

**Files:**
- Create: `packages/extension/src/background/offscreen.ts`
- Test: `packages/extension/tests/background/offscreen.test.ts`

Manages offscreen document lifecycle and provides a `sendToOffscreen()` function with retry logic.

- [ ] **Step 1: Write the test**

```typescript
// packages/extension/tests/background/offscreen.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetChromeMock, chromeMock } from "../chrome-mock.js";
import { sendToOffscreen } from "../../src/background/offscreen.js";

describe("sendToOffscreen", () => {
  beforeEach(() => {
    resetChromeMock();
  });

  it("creates offscreen document if not exists and sends message", async () => {
    chromeMock.offscreen.hasDocument.mockResolvedValue(false);
    chromeMock.offscreen.createDocument.mockResolvedValue(undefined);
    chromeMock.runtime.sendMessage.mockResolvedValue({
      success: true,
      data: "ok",
    });

    const result = await sendToOffscreen({ type: "getTrailsAll" });
    expect(chromeMock.offscreen.createDocument).toHaveBeenCalled();
    expect(result).toEqual({ success: true, data: "ok" });
  });

  it("skips creation if document already exists", async () => {
    chromeMock.offscreen.hasDocument.mockResolvedValue(true);
    chromeMock.runtime.sendMessage.mockResolvedValue({
      success: true,
      data: [],
    });

    await sendToOffscreen({ type: "getTrailsAll" });
    expect(chromeMock.offscreen.createDocument).not.toHaveBeenCalled();
  });

  it("retries on sendMessage failure", async () => {
    chromeMock.offscreen.hasDocument.mockResolvedValue(true);
    chromeMock.runtime.sendMessage
      .mockRejectedValueOnce(new Error("disconnected"))
      .mockResolvedValueOnce({ success: true, data: "ok" });
    // After failure, hasDocument returns false so it recreates
    chromeMock.offscreen.hasDocument.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    chromeMock.offscreen.createDocument.mockResolvedValue(undefined);

    const result = await sendToOffscreen({ type: "getTrailsAll" });
    expect(result).toEqual({ success: true, data: "ok" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/extension && pnpm test -- tests/background/offscreen.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement offscreen client**

```typescript
// packages/extension/src/background/offscreen.ts
import type { OffscreenRequest, OffscreenResponse, OffscreenEnvelope } from "../shared/messaging.js";

const OFFSCREEN_URL = "src/offscreen/index.html";
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 500;

async function ensureOffscreenDocument(): Promise<void> {
  const exists = await chrome.offscreen.hasDocument();
  if (exists) return;

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: [chrome.offscreen.Reason.WORKERS],
    justification: "IndexedDB access for Wikipedia Breadcrumbs",
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendToOffscreen<T = unknown>(
  message: OffscreenRequest
): Promise<OffscreenResponse<T>> {
  const envelope: OffscreenEnvelope = { target: "offscreen", request: message };
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      await ensureOffscreenDocument();
      return await chrome.runtime.sendMessage(envelope);
    } catch (err) {
      if (attempt < MAX_RETRIES - 1) {
        await sleep(RETRY_DELAY_MS * (attempt + 1));
      } else {
        console.error("Failed to communicate with offscreen document:", err);
        return { success: false, error: String(err) };
      }
    }
  }
  return { success: false, error: "Max retries exceeded" };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/extension && pnpm test -- tests/background/offscreen.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/extension/src/background/offscreen.ts packages/extension/tests/background/offscreen.test.ts
git commit -m "feat(extension): add offscreen document lifecycle manager with retry"
```

---

### Task 8: Alarm Manager

**Files:**
- Create: `packages/extension/src/background/alarm-manager.ts`
- Test: `packages/extension/tests/background/alarm-manager.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// packages/extension/tests/background/alarm-manager.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { resetChromeMock, chromeMock } from "../chrome-mock.js";
import { resetIdleAlarm, clearIdleAlarm, ALARM_PREFIX } from "../../src/background/alarm-manager.js";

describe("alarm-manager", () => {
  beforeEach(() => {
    resetChromeMock();
  });

  it("resetIdleAlarm clears and creates alarm for tab", async () => {
    await resetIdleAlarm(42, 30);
    expect(chromeMock.alarms.clear).toHaveBeenCalledWith(`${ALARM_PREFIX}42`);
    expect(chromeMock.alarms.create).toHaveBeenCalledWith(
      `${ALARM_PREFIX}42`,
      { delayInMinutes: 30 }
    );
  });

  it("clearIdleAlarm clears alarm for tab", async () => {
    await clearIdleAlarm(42);
    expect(chromeMock.alarms.clear).toHaveBeenCalledWith(`${ALARM_PREFIX}42`);
  });

  it("ALARM_PREFIX is correct", () => {
    expect(ALARM_PREFIX).toBe("idle-tab-");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/extension && pnpm test -- tests/background/alarm-manager.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement alarm manager**

```typescript
// packages/extension/src/background/alarm-manager.ts

export const ALARM_PREFIX = "idle-tab-";

export async function resetIdleAlarm(
  tabId: number,
  timeoutMinutes: number
): Promise<void> {
  const name = `${ALARM_PREFIX}${tabId}`;
  await chrome.alarms.clear(name);
  chrome.alarms.create(name, { delayInMinutes: timeoutMinutes });
}

export async function clearIdleAlarm(tabId: number): Promise<void> {
  await chrome.alarms.clear(`${ALARM_PREFIX}${tabId}`);
}

export function parseTabIdFromAlarm(alarmName: string): number | null {
  if (!alarmName.startsWith(ALARM_PREFIX)) return null;
  const id = parseInt(alarmName.slice(ALARM_PREFIX.length), 10);
  return isNaN(id) ? null : id;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/extension && pnpm test -- tests/background/alarm-manager.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/extension/src/background/alarm-manager.ts packages/extension/tests/background/alarm-manager.test.ts
git commit -m "feat(extension): add idle timeout alarm manager"
```

---

### Task 9: Trail Manager

**Files:**
- Create: `packages/extension/src/background/trail-manager.ts`
- Test: `packages/extension/tests/background/trail-manager.test.ts`

Manages the in-memory `Map<tabId, ActiveTrailEntry>` and provides methods for trail lifecycle.

- [ ] **Step 1: Write the test**

```typescript
// packages/extension/tests/background/trail-manager.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import {
  TrailManager,
  type ActiveTrailEntry,
} from "../../src/background/trail-manager.js";

describe("TrailManager", () => {
  let manager: TrailManager;

  beforeEach(() => {
    manager = new TrailManager();
  });

  it("setActive stores and retrieves an entry", () => {
    const entry: ActiveTrailEntry = {
      trailId: "t1",
      tabId: 42,
      windowId: 1,
      lastVisitTimestamp: Date.now(),
      lastVisitPosition: 1,
    };
    manager.setActive(42, entry);
    expect(manager.getActive(42)).toEqual(entry);
  });

  it("getActive returns undefined for unknown tab", () => {
    expect(manager.getActive(999)).toBeUndefined();
  });

  it("removeTab clears the entry", () => {
    manager.setActive(42, {
      trailId: "t1",
      tabId: 42,
      windowId: 1,
      lastVisitTimestamp: Date.now(),
      lastVisitPosition: 1,
    });
    manager.removeTab(42);
    expect(manager.getActive(42)).toBeUndefined();
  });

  it("removeByTrailId removes matching entry", () => {
    manager.setActive(42, {
      trailId: "t1",
      tabId: 42,
      windowId: 1,
      lastVisitTimestamp: Date.now(),
      lastVisitPosition: 1,
    });
    manager.setActive(43, {
      trailId: "t2",
      tabId: 43,
      windowId: 1,
      lastVisitTimestamp: Date.now(),
      lastVisitPosition: 1,
    });
    manager.removeByTrailId("t1");
    expect(manager.getActive(42)).toBeUndefined();
    expect(manager.getActive(43)).toBeDefined();
  });

  it("getTabsForWindow returns all tabs in a window", () => {
    manager.setActive(1, {
      trailId: "t1",
      tabId: 1,
      windowId: 10,
      lastVisitTimestamp: Date.now(),
      lastVisitPosition: 1,
    });
    manager.setActive(2, {
      trailId: "t2",
      tabId: 2,
      windowId: 10,
      lastVisitTimestamp: Date.now(),
      lastVisitPosition: 1,
    });
    manager.setActive(3, {
      trailId: "t3",
      tabId: 3,
      windowId: 20,
      lastVisitTimestamp: Date.now(),
      lastVisitPosition: 1,
    });
    expect(manager.getTabsForWindow(10)).toEqual([1, 2]);
    expect(manager.getTabsForWindow(20)).toEqual([3]);
  });

  it("incrementPosition updates and returns new position", () => {
    manager.setActive(42, {
      trailId: "t1",
      tabId: 42,
      windowId: 1,
      lastVisitTimestamp: Date.now(),
      lastVisitPosition: 3,
    });
    const newPos = manager.incrementPosition(42);
    expect(newPos).toBe(4);
    expect(manager.getActive(42)!.lastVisitPosition).toBe(4);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/extension && pnpm test -- tests/background/trail-manager.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement trail manager**

```typescript
// packages/extension/src/background/trail-manager.ts

export interface ActiveTrailEntry {
  trailId: string;
  tabId: number;
  windowId: number;
  lastVisitTimestamp: number;
  lastVisitPosition: number;
}

export class TrailManager {
  private activeTrails = new Map<number, ActiveTrailEntry>();

  setActive(tabId: number, entry: ActiveTrailEntry): void {
    this.activeTrails.set(tabId, entry);
  }

  getActive(tabId: number): ActiveTrailEntry | undefined {
    return this.activeTrails.get(tabId);
  }

  removeTab(tabId: number): void {
    this.activeTrails.delete(tabId);
  }

  removeByTrailId(trailId: string): void {
    for (const [tabId, entry] of this.activeTrails) {
      if (entry.trailId === trailId) {
        this.activeTrails.delete(tabId);
      }
    }
  }

  getTabsForWindow(windowId: number): number[] {
    const tabs: number[] = [];
    for (const [tabId, entry] of this.activeTrails) {
      if (entry.windowId === windowId) tabs.push(tabId);
    }
    return tabs;
  }

  incrementPosition(tabId: number): number {
    const entry = this.activeTrails.get(tabId);
    if (!entry) throw new Error(`No active trail for tab ${tabId}`);
    entry.lastVisitPosition += 1;
    entry.lastVisitTimestamp = Date.now();
    return entry.lastVisitPosition;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/extension && pnpm test -- tests/background/trail-manager.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/extension/src/background/trail-manager.ts packages/extension/tests/background/trail-manager.test.ts
git commit -m "feat(extension): add in-memory trail manager for active trails"
```

---

### Task 10: Capture Orchestration

**Files:**
- Create: `packages/extension/src/background/capture.ts`
- Test: `packages/extension/tests/background/capture.test.ts`

Orchestrates the full visit capture flow: parse URL, get click context, detect trail, create visit.

- [ ] **Step 1: Write the test**

```typescript
// packages/extension/tests/background/capture.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetChromeMock, chromeMock } from "../chrome-mock.js";
import { TrailManager } from "../../src/background/trail-manager.js";
import { handleNavigation } from "../../src/background/capture.js";

// Mock sendToOffscreen
vi.mock("../../src/background/offscreen.js", () => ({
  sendToOffscreen: vi.fn(async (msg: any) => {
    if (msg.type === "addTrail") return { success: true, data: msg.trail };
    if (msg.type === "addVisit") return { success: true, data: msg.visit };
    if (msg.type === "getActiveTrailForTab") return { success: true, data: null };
    return { success: true, data: null };
  }),
}));

describe("handleNavigation", () => {
  let trailManager: TrailManager;

  beforeEach(() => {
    resetChromeMock();
    trailManager = new TrailManager();
    // Mock content script response
    chromeMock.tabs.sendMessage.mockResolvedValue({
      clickedLinkText: null,
      referrerUrl: null,
    });
  });

  it("creates new trail and visit for first navigation", async () => {
    const { sendToOffscreen } = await import("../../src/background/offscreen.js");

    await handleNavigation(
      {
        tabId: 1,
        url: "https://en.wikipedia.org/wiki/Rust_(programming_language)",
        frameId: 0,
        windowId: 1,
      },
      trailManager,
      "device-1",
      30
    );

    expect(sendToOffscreen).toHaveBeenCalledWith(
      expect.objectContaining({ type: "addTrail" })
    );
    expect(sendToOffscreen).toHaveBeenCalledWith(
      expect.objectContaining({ type: "addVisit" })
    );
    expect(trailManager.getActive(1)).toBeDefined();
  });

  it("skips non-Wikipedia URLs", async () => {
    const { sendToOffscreen } = await import("../../src/background/offscreen.js");

    await handleNavigation(
      { tabId: 1, url: "https://google.com", frameId: 0, windowId: 1 },
      trailManager,
      "device-1",
      30
    );

    expect(sendToOffscreen).not.toHaveBeenCalled();
  });

  it("skips sub-frames (frameId !== 0)", async () => {
    const { sendToOffscreen } = await import("../../src/background/offscreen.js");

    await handleNavigation(
      {
        tabId: 1,
        url: "https://en.wikipedia.org/wiki/Test",
        frameId: 1,
        windowId: 1,
      },
      trailManager,
      "device-1",
      30
    );

    expect(sendToOffscreen).not.toHaveBeenCalled();
  });

  it("appends visit to existing trail in same tab", async () => {
    const { sendToOffscreen } = await import("../../src/background/offscreen.js");

    // First navigation creates trail
    await handleNavigation(
      { tabId: 1, url: "https://en.wikipedia.org/wiki/Rust_(programming_language)", frameId: 0, windowId: 1 },
      trailManager,
      "device-1",
      30
    );

    // Mock content script returns link click
    chromeMock.tabs.sendMessage.mockResolvedValue({
      clickedLinkText: "Rust",
      referrerUrl: "https://en.wikipedia.org/wiki/Programming",
    });

    // Second navigation appends
    await handleNavigation(
      { tabId: 1, url: "https://en.wikipedia.org/wiki/Cargo_(Rust)", frameId: 0, windowId: 1 },
      trailManager,
      "device-1",
      30
    );

    const entry = trailManager.getActive(1);
    expect(entry!.lastVisitPosition).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/extension && pnpm test -- tests/background/capture.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement capture orchestration**

```typescript
// packages/extension/src/background/capture.ts
import {
  parseWikipediaUrl,
  createVisit,
  createTrail,
  shouldStartNewTrail,
  SourceType,
  StartReason,
} from "@wikipedia-breadcrumbs/shared";
import type { TrailDetectionContext } from "@wikipedia-breadcrumbs/shared";
import { sendToOffscreen } from "./offscreen.js";
import { TrailManager } from "./trail-manager.js";
import { resetIdleAlarm } from "./alarm-manager.js";
import type { ContentResponse } from "../shared/messaging.js";

interface NavigationDetails {
  tabId: number;
  url: string;
  frameId: number;
  windowId: number;
}

async function getClickContext(tabId: number): Promise<{
  clickedLinkText: string | null;
  referrerUrl: string | null;
}> {
  try {
    const response: ContentResponse = await Promise.race([
      chrome.tabs.sendMessage(tabId, { type: "getClickContext" }),
      new Promise<ContentResponse>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 500)
      ),
    ]);
    if ("clickedLinkText" in response) {
      return response;
    }
  } catch {
    // Content script not ready or timeout
  }
  return { clickedLinkText: null, referrerUrl: null };
}

function inferSourceType(
  clickedLinkText: string | null,
  referrerUrl: string | null,
  isFromSearch: boolean
): SourceType {
  if (isFromSearch) return SourceType.Search;
  if (referrerUrl && !referrerUrl.includes("wikipedia.org")) return SourceType.External;
  if (clickedLinkText) return SourceType.Link;
  return SourceType.External;
}

export async function handleNavigation(
  details: NavigationDetails,
  trailManager: TrailManager,
  deviceId: string,
  idleTimeoutMinutes: number
): Promise<void> {
  // Skip sub-frames
  if (details.frameId !== 0) return;

  // Parse and validate URL
  const parsed = parseWikipediaUrl(details.url);
  if (!parsed) return;

  const { tabId } = details;

  // Get click context from content script
  const { clickedLinkText, referrerUrl } = await getClickContext(tabId);

  // Check if we need a new trail
  const current = trailManager.getActive(tabId);
  const isMainPage = parsed.title === "Main Page";
  const isFromSearch = referrerUrl?.includes("wikipedia.org/w/index.php?search=") ?? false;

  const context: TrailDetectionContext = {
    currentTrailTabId: current?.tabId ?? null,
    currentTrailWindowId: current?.windowId ?? null,
    newTabId: tabId,
    newWindowId: details.windowId,
    isNewTab: current === undefined,
    transitionType: clickedLinkText ? "link" : "typed",
    referrerUrl,
    newUrl: details.url,
    msSinceLastVisit: current
      ? Date.now() - current.lastVisitTimestamp
      : Infinity,
    idleTimeoutMs: idleTimeoutMinutes * 60 * 1000,
    isMainPage,
    isFromSearch,
  };

  const detection = shouldStartNewTrail(context);

  if (detection.isNew || !current) {
    // Create new trail
    const trail = createTrail({
      startReason: detection.isNew ? detection.reason : StartReason.AutoNewTab,
      deviceId,
    });
    await sendToOffscreen({ type: "addTrail", trail });

    const visit = createVisit({
      trailId: trail.id,
      url: parsed.cleanUrl,
      title: parsed.title,
      position: 1,
      sourceType: inferSourceType(clickedLinkText, referrerUrl, isFromSearch),
      sourceDetail: clickedLinkText,
      language: parsed.language,
      articleId: parsed.cleanUrl.split("/wiki/")[1] ?? parsed.title,
      tabId,
    });
    await sendToOffscreen({ type: "addVisit", visit });

    trailManager.setActive(tabId, {
      trailId: trail.id,
      tabId,
      windowId: details.windowId,
      lastVisitTimestamp: Date.now(),
      lastVisitPosition: 1,
    });
  } else {
    // Append to existing trail
    const position = trailManager.incrementPosition(tabId);

    const visit = createVisit({
      trailId: current.trailId,
      url: parsed.cleanUrl,
      title: parsed.title,
      position,
      sourceType: inferSourceType(clickedLinkText, referrerUrl, isFromSearch),
      sourceDetail: clickedLinkText,
      language: parsed.language,
      articleId: parsed.cleanUrl.split("/wiki/")[1] ?? parsed.title,
      tabId,
    });
    await sendToOffscreen({ type: "addVisit", visit });
  }

  // Reset idle alarm
  await resetIdleAlarm(tabId, idleTimeoutMinutes);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/extension && pnpm test -- tests/background/capture.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/extension/src/background/capture.ts packages/extension/tests/background/capture.test.ts
git commit -m "feat(extension): add visit capture orchestration"
```

---

### Task 11: Background Service Worker Entry

**Files:**
- Modify: `packages/extension/src/background/index.ts`

This wires up all event listeners. No unit test — tested by loading the extension in Chrome.

- [ ] **Step 1: Implement background entry**

```typescript
// packages/extension/src/background/index.ts
import { getSettings } from "../shared/settings.js";
import { getDeviceId } from "../shared/device-id.js";
import { TrailManager } from "./trail-manager.js";
import { handleNavigation } from "./capture.js";
import { parseTabIdFromAlarm, clearIdleAlarm } from "./alarm-manager.js";
import { sendToOffscreen } from "./offscreen.js";
import type { BackgroundMessage } from "../shared/messaging.js";

const trailManager = new TrailManager();
let deviceId = "";
let settings = { idleTimeoutMinutes: 30, captureEnabled: true };

// Initialize on install/startup
async function initialize() {
  deviceId = await getDeviceId();
  settings = await getSettings();
}

chrome.runtime.onInstalled.addListener(initialize);
chrome.runtime.onStartup.addListener(initialize);
// Also initialize immediately for SW restart
initialize();

// Listen for settings changes
chrome.storage.onChanged.addListener((changes) => {
  if (changes.idleTimeoutMinutes) {
    settings.idleTimeoutMinutes = changes.idleTimeoutMinutes.newValue;
  }
  if (changes.captureEnabled) {
    settings.captureEnabled = changes.captureEnabled.newValue;
  }
});

// Navigation capture
chrome.webNavigation.onCompleted.addListener(async (details) => {
  if (!settings.captureEnabled) return;
  // Fetch windowId for the tab (webNavigation doesn't include it)
  let windowId = 0;
  try {
    const tab = await chrome.tabs.get(details.tabId);
    windowId = tab.windowId;
  } catch { /* tab may have been closed */ }
  await handleNavigation(
    { ...details, windowId },
    trailManager, deviceId, settings.idleTimeoutMinutes
  );
});

// Tab lifecycle
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const entry = trailManager.getActive(tabId);
  if (entry) {
    await sendToOffscreen({ type: "finalizeTrail", trailId: entry.trailId });
    trailManager.removeTab(tabId);
    await clearIdleAlarm(tabId);
  }
});

chrome.tabs.onReplaced.addListener(async (_addedTabId, removedTabId) => {
  const entry = trailManager.getActive(removedTabId);
  if (entry) {
    await sendToOffscreen({ type: "finalizeTrail", trailId: entry.trailId });
    trailManager.removeTab(removedTabId);
    await clearIdleAlarm(removedTabId);
  }
});

chrome.windows.onRemoved.addListener(async (windowId) => {
  const tabIds = trailManager.getTabsForWindow(windowId);
  for (const tabId of tabIds) {
    const entry = trailManager.getActive(tabId);
    if (entry) {
      await sendToOffscreen({ type: "finalizeTrail", trailId: entry.trailId });
      trailManager.removeTab(tabId);
      await clearIdleAlarm(tabId);
    }
  }
});

// Idle timeout alarm
chrome.alarms.onAlarm.addListener((alarm) => {
  const tabId = parseTabIdFromAlarm(alarm.name);
  if (tabId !== null) {
    trailManager.removeTab(tabId);
  }
});

// Message handler for popup, history page, and UI-initiated mutations
chrome.runtime.onMessage.addListener(
  (message: any, _sender, sendResponse) => {
    // Ignore messages targeted at offscreen document
    if (message.target === "offscreen") return false;
    handleBackgroundMessage(message as BackgroundMessage, sendResponse);
    return true;
  }
);

async function handleBackgroundMessage(
  message: BackgroundMessage,
  sendResponse: (response: unknown) => void
) {
  switch (message.type) {
    case "getCurrentTrail": {
      const entry = trailManager.getActive(message.tabId);
      if (entry) {
        const result = await sendToOffscreen({
          type: "getVisitsByTrailId",
          trailId: entry.trailId,
        });
        const trailResult = await sendToOffscreen({
          type: "getTrailById",
          trailId: entry.trailId,
        });
        sendResponse({
          trail: trailResult.success ? trailResult.data : null,
          visits: result.success ? result.data : [],
        });
      } else {
        // Try SW restart recovery
        const result = await sendToOffscreen({
          type: "getActiveTrailForTab",
          tabId: message.tabId,
        });
        if (result.success && result.data) {
          const { trail, lastVisit, visitCount } = result.data as any;
          // Get windowId for recovery; fallback to 0 if tab query fails
          let winId = 0;
          try { winId = (await chrome.tabs.get(message.tabId)).windowId; } catch {}
          trailManager.setActive(message.tabId, {
            trailId: trail.id,
            tabId: message.tabId,
            windowId: winId,
            lastVisitTimestamp: new Date(lastVisit.timestamp).getTime(),
            lastVisitPosition: visitCount,
          });
          const visits = await sendToOffscreen({
            type: "getVisitsByTrailId",
            trailId: trail.id,
          });
          sendResponse({ trail, visits: visits.success ? visits.data : [] });
        } else {
          sendResponse({ trail: null, visits: [] });
        }
      }
      break;
    }
    case "startNewTrail": {
      // Remove current trail entry, next navigation creates new trail
      trailManager.removeTab(message.tabId);
      sendResponse({ ok: true });
      break;
    }
    case "endTrail": {
      await sendToOffscreen({
        type: "finalizeTrail",
        trailId: message.trailId,
      });
      trailManager.removeByTrailId(message.trailId);
      sendResponse({ ok: true });
      break;
    }
    case "renameTrail": {
      await sendToOffscreen({
        type: "updateTrail",
        trailId: message.trailId,
        changes: { name: message.name },
      });
      sendResponse({ ok: true });
      break;
    }
    case "trailMutated": {
      trailManager.removeByTrailId(message.trailId);
      sendResponse({ ok: true });
      break;
    }
    case "trailDeleted": {
      trailManager.removeByTrailId(message.trailId);
      sendResponse({ ok: true });
      break;
    }
    default: {
      // Forward offscreen requests from UI pages that go through background
      sendResponse({ ok: false, error: "Unknown message type" });
    }
  }
}
```

- [ ] **Step 2: Run all tests**

Run: `cd packages/extension && pnpm test`
Expected: All existing tests still pass

- [ ] **Step 3: Verify build**

Run: `cd packages/extension && pnpm build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add packages/extension/src/background/index.ts
git commit -m "feat(extension): wire up background service worker with event listeners"
```

---

## Chunk 3: Content Script + Popup + Options UI

### Task 12: Content Script

**Files:**
- Create: `packages/extension/src/content/link-tracker.ts`
- Modify: `packages/extension/src/content/index.ts`
- Test: `packages/extension/tests/content/link-tracker.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// packages/extension/tests/content/link-tracker.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { LinkTracker } from "../../src/content/link-tracker.js";

describe("LinkTracker", () => {
  let tracker: LinkTracker;

  beforeEach(() => {
    tracker = new LinkTracker();
  });

  it("records click on Wikipedia article link", () => {
    tracker.handleClick({
      href: "https://en.wikipedia.org/wiki/Rust_(programming_language)",
      textContent: "Rust",
    });

    const context = tracker.consumeClickContext();
    expect(context.clickedLinkText).toBe("Rust");
    expect(context.referrerUrl).toBeNull();
  });

  it("consumeClickContext clears stored data", () => {
    tracker.handleClick({
      href: "https://en.wikipedia.org/wiki/Rust_(programming_language)",
      textContent: "Rust",
    });

    tracker.consumeClickContext();
    const second = tracker.consumeClickContext();
    expect(second.clickedLinkText).toBeNull();
  });

  it("returns nulls when no click recorded", () => {
    const context = tracker.consumeClickContext();
    expect(context.clickedLinkText).toBeNull();
    expect(context.referrerUrl).toBeNull();
  });

  it("ignores non-Wikipedia links", () => {
    tracker.handleClick({
      href: "https://google.com",
      textContent: "Google",
    });

    const context = tracker.consumeClickContext();
    expect(context.clickedLinkText).toBeNull();
  });

  it("setReferrer stores referrer URL", () => {
    tracker.setReferrer("https://google.com");
    tracker.handleClick({
      href: "https://en.wikipedia.org/wiki/Test",
      textContent: "Test",
    });

    const context = tracker.consumeClickContext();
    expect(context.referrerUrl).toBe("https://google.com");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/extension && pnpm test -- tests/content/link-tracker.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement link tracker**

```typescript
// packages/extension/src/content/link-tracker.ts
import { isWikipediaUrl } from "@wikipedia-breadcrumbs/shared";

interface ClickData {
  href: string;
  textContent: string;
}

export class LinkTracker {
  private lastClick: ClickData | null = null;
  private referrer: string | null = null;

  handleClick(link: ClickData): void {
    if (isWikipediaUrl(link.href)) {
      this.lastClick = link;
    }
  }

  setReferrer(url: string): void {
    this.referrer = url;
  }

  consumeClickContext(): {
    clickedLinkText: string | null;
    referrerUrl: string | null;
  } {
    const result = {
      clickedLinkText: this.lastClick?.textContent ?? null,
      referrerUrl: this.referrer,
    };
    this.lastClick = null;
    return result;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/extension && pnpm test -- tests/content/link-tracker.test.ts`
Expected: PASS

- [ ] **Step 5: Update content script entry**

```typescript
// packages/extension/src/content/index.ts
import { LinkTracker } from "./link-tracker.js";
import type { ContentMessage } from "../shared/messaging.js";

const tracker = new LinkTracker();
tracker.setReferrer(document.referrer);

// Delegated click listener on body
document.body.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  const anchor = target.closest("a[href]") as HTMLAnchorElement | null;
  if (anchor?.href) {
    tracker.handleClick({
      href: anchor.href,
      textContent: anchor.textContent?.trim() ?? "",
    });
  }
});

// Message handler
chrome.runtime.onMessage.addListener(
  (message: ContentMessage, _sender, sendResponse) => {
    if (message.type === "getClickContext") {
      sendResponse(tracker.consumeClickContext());
    } else if (message.type === "ping") {
      sendResponse({ pong: true });
    }
    return false;
  }
);
```

- [ ] **Step 6: Commit**

```bash
git add packages/extension/src/content/ packages/extension/tests/content/
git commit -m "feat(extension): add content script with link click tracking"
```

---

### Task 13: Popup UI

**Files:**
- Modify: `packages/extension/src/popup/index.html`
- Modify: `packages/extension/src/popup/main.ts`
- Create: `packages/extension/src/popup/App.svelte`
- Create: `packages/extension/src/popup/TrailView.svelte`
- Create: `packages/extension/src/popup/Controls.svelte`

- [ ] **Step 1: Update popup HTML**

```html
<!-- packages/extension/src/popup/index.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Wikipedia Breadcrumbs</title>
  <style>
    body { width: 360px; min-height: 200px; margin: 0; font-family: system-ui, sans-serif; font-size: 14px; color: #1a1a1a; }
  </style>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="./main.ts"></script>
</body>
</html>
```

- [ ] **Step 2: Update popup main.ts**

```typescript
// packages/extension/src/popup/main.ts
import { mount } from "svelte";
import App from "./App.svelte";

mount(App, { target: document.getElementById("app")! });
```

- [ ] **Step 3: Create Controls.svelte**

```svelte
<!-- packages/extension/src/popup/Controls.svelte -->
<script lang="ts">
  interface Props {
    hasActiveTrail: boolean;
    trailId: string | null;
    tabId: number;
    onStartNew: () => void;
    onEndTrail: () => void;
  }

  let { hasActiveTrail, trailId, tabId, onStartNew, onEndTrail }: Props = $props();

  function openHistory() {
    chrome.tabs.create({ url: chrome.runtime.getURL("src/history/index.html") });
  }

  function openOptions() {
    chrome.runtime.openOptionsPage();
  }
</script>

<div class="controls">
  {#if hasActiveTrail}
    <button onclick={onEndTrail}>End Trail</button>
  {:else}
    <button onclick={onStartNew}>Start New Trail</button>
  {/if}
  <button onclick={openHistory}>History</button>
  <button onclick={openOptions}>Options</button>
</div>

<style>
  .controls { display: flex; gap: 8px; padding: 8px 12px; border-top: 1px solid #e0e0e0; }
  button { flex: 1; padding: 6px 12px; border: 1px solid #ccc; border-radius: 4px; background: white; cursor: pointer; font-size: 13px; }
  button:hover { background: #f0f0f0; }
</style>
```

- [ ] **Step 4: Create TrailView.svelte**

```svelte
<!-- packages/extension/src/popup/TrailView.svelte -->
<script lang="ts">
  import type { Trail, Visit } from "@wikipedia-breadcrumbs/shared";

  interface Props {
    trail: Trail | null;
    visits: Visit[];
    onRename: (name: string) => void;
  }

  let { trail, visits, onRename }: Props = $props();

  let editing = $state(false);
  let editName = $state("");

  function startEdit() {
    editName = trail?.name ?? "";
    editing = true;
  }

  function saveEdit() {
    if (editName.trim()) onRename(editName.trim());
    editing = false;
  }

  function timeAgo(iso: string): string {
    const ms = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(ms / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  const recentVisits = $derived(visits.slice(-5).reverse());
  const trailName = $derived(trail?.name ?? `Trail (${visits.length} pages)`);
</script>

{#if trail}
  <div class="trail-view">
    <div class="header">
      {#if editing}
        <input bind:value={editName} onkeydown={(e) => e.key === "Enter" && saveEdit()} autofocus />
        <button onclick={saveEdit}>Save</button>
      {:else}
        <h2 onclick={startEdit}>{trailName}</h2>
      {/if}
      <span class="meta">{visits.length} pages &middot; started {timeAgo(trail.startedAt)}</span>
    </div>
    <ul class="visits">
      {#each recentVisits as visit}
        <li>
          <a href={visit.url} target="_blank">{visit.title}</a>
          <span class="time">{timeAgo(visit.timestamp)}</span>
        </li>
      {/each}
    </ul>
    {#if visits.length > 5}
      <a class="see-all" href={chrome.runtime.getURL(`src/history/index.html?trail=${trail.id}`)} target="_blank">
        See full trail ({visits.length} pages)
      </a>
    {/if}
  </div>
{:else}
  <div class="empty">
    <p>No active trail on this tab.</p>
    <p>Browse Wikipedia to start capturing!</p>
  </div>
{/if}

<style>
  .trail-view { padding: 12px; }
  .header h2 { margin: 0 0 4px; font-size: 16px; cursor: pointer; }
  .header h2:hover { color: #0066cc; }
  .meta { font-size: 12px; color: #666; }
  .visits { list-style: none; padding: 0; margin: 12px 0 0; }
  .visits li { padding: 4px 0; border-bottom: 1px solid #f0f0f0; display: flex; justify-content: space-between; align-items: center; }
  .visits a { color: #0066cc; text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 240px; }
  .time { font-size: 11px; color: #999; flex-shrink: 0; }
  .see-all { display: block; text-align: center; padding: 8px; font-size: 13px; color: #0066cc; }
  .empty { padding: 24px 12px; text-align: center; color: #666; }
  input { font-size: 14px; padding: 2px 6px; border: 1px solid #0066cc; border-radius: 3px; width: 200px; }
</style>
```

- [ ] **Step 5: Create App.svelte**

```svelte
<!-- packages/extension/src/popup/App.svelte -->
<script lang="ts">
  import type { Trail, Visit } from "@wikipedia-breadcrumbs/shared";
  import TrailView from "./TrailView.svelte";
  import Controls from "./Controls.svelte";

  let trail: Trail | null = $state(null);
  let visits: Visit[] = $state([]);
  let tabId = $state(0);
  let loading = $state(true);

  async function loadCurrentTrail() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) { loading = false; return; }
    tabId = tab.id;

    const response = await chrome.runtime.sendMessage({
      type: "getCurrentTrail",
      tabId: tab.id,
    });
    trail = response.trail;
    visits = response.visits ?? [];
    loading = false;
  }

  async function startNewTrail() {
    await chrome.runtime.sendMessage({ type: "startNewTrail", tabId });
    // Clear current state; next Wikipedia navigation will create new trail
    trail = null;
    visits = [];
  }

  async function endTrail() {
    if (!trail) return;
    await chrome.runtime.sendMessage({ type: "endTrail", trailId: trail.id });
    trail = null;
    visits = [];
  }

  async function renameTrail(name: string) {
    if (!trail) return;
    await chrome.runtime.sendMessage({ type: "renameTrail", trailId: trail.id, name });
    trail.name = name;
  }

  loadCurrentTrail();
</script>

<main>
  {#if loading}
    <div class="loading">Loading...</div>
  {:else}
    <TrailView {trail} {visits} onRename={renameTrail} />
    <Controls
      hasActiveTrail={trail !== null}
      trailId={trail?.id ?? null}
      {tabId}
      onStartNew={startNewTrail}
      onEndTrail={endTrail}
    />
  {/if}
</main>

<style>
  main { display: flex; flex-direction: column; min-height: 200px; }
  .loading { padding: 24px; text-align: center; color: #666; }
</style>
```

- [ ] **Step 6: Verify build**

Run: `cd packages/extension && pnpm build`
Expected: Build succeeds with popup page

- [ ] **Step 7: Commit**

```bash
git add packages/extension/src/popup/
git commit -m "feat(extension): add popup UI with trail view and controls"
```

---

### Task 14: Options Page

**Files:**
- Modify: `packages/extension/src/options/index.html`
- Modify: `packages/extension/src/options/main.ts`
- Create: `packages/extension/src/options/App.svelte`
- Create: `packages/extension/src/options/SettingsForm.svelte`

- [ ] **Step 1: Update options HTML**

```html
<!-- packages/extension/src/options/index.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Wikipedia Breadcrumbs Options</title>
  <style>
    body { max-width: 600px; margin: 40px auto; font-family: system-ui, sans-serif; color: #1a1a1a; padding: 0 20px; }
  </style>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="./main.ts"></script>
</body>
</html>
```

- [ ] **Step 2: Update options main.ts**

```typescript
// packages/extension/src/options/main.ts
import { mount } from "svelte";
import App from "./App.svelte";

mount(App, { target: document.getElementById("app")! });
```

- [ ] **Step 3: Create SettingsForm.svelte**

```svelte
<!-- packages/extension/src/options/SettingsForm.svelte -->
<script lang="ts">
  import { getSettings, updateSettings, type ExtensionSettings } from "../shared/settings.js";

  let settings: ExtensionSettings | null = $state(null);
  let saved = $state(false);

  async function load() {
    settings = await getSettings();
  }

  async function save() {
    if (!settings) return;
    await updateSettings(settings);
    saved = true;
    setTimeout(() => saved = false, 2000);
  }

  load();
</script>

{#if settings}
  <form onsubmit={(e) => { e.preventDefault(); save(); }}>
    <div class="field">
      <label for="idle-timeout">Idle timeout (minutes)</label>
      <input
        id="idle-timeout"
        type="number"
        min="5"
        max="120"
        bind:value={settings.idleTimeoutMinutes}
      />
      <p class="help">A new trail starts after this many minutes of no Wikipedia navigation in a tab.</p>
    </div>

    <div class="field">
      <label>
        <input type="checkbox" bind:checked={settings.captureEnabled} />
        Capture enabled
      </label>
      <p class="help">When disabled, no new visits are recorded.</p>
    </div>

    <button type="submit">Save</button>
    {#if saved}
      <span class="saved">Saved!</span>
    {/if}
  </form>
{:else}
  <p>Loading...</p>
{/if}

<style>
  .field { margin-bottom: 20px; }
  label { font-weight: 600; display: block; margin-bottom: 4px; }
  input[type="number"] { width: 80px; padding: 4px 8px; border: 1px solid #ccc; border-radius: 4px; }
  .help { font-size: 13px; color: #666; margin: 4px 0 0; }
  button { padding: 8px 20px; background: #0066cc; color: white; border: none; border-radius: 4px; cursor: pointer; }
  button:hover { background: #0052a3; }
  .saved { color: #28a745; margin-left: 12px; }
</style>
```

- [ ] **Step 4: Create App.svelte**

```svelte
<!-- packages/extension/src/options/App.svelte -->
<script lang="ts">
  import SettingsForm from "./SettingsForm.svelte";
</script>

<main>
  <h1>Wikipedia Breadcrumbs</h1>
  <h2>Settings</h2>
  <SettingsForm />
</main>

<style>
  h1 { margin: 0 0 8px; font-size: 24px; }
  h2 { margin: 0 0 20px; font-size: 18px; color: #666; font-weight: normal; }
</style>
```

- [ ] **Step 5: Verify build**

Run: `cd packages/extension && pnpm build`
Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
git add packages/extension/src/options/
git commit -m "feat(extension): add options page with settings form"
```

---

## Chunk 4: History Page

### Task 15: History Page Setup + VisitCard

**Files:**
- Modify: `packages/extension/src/history/index.html`
- Create: `packages/extension/src/history/main.ts`
- Create: `packages/extension/src/history/VisitCard.svelte`

- [ ] **Step 1: Update history HTML**

```html
<!-- packages/extension/src/history/index.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Wikipedia Breadcrumbs — History</title>
  <style>
    body { max-width: 900px; margin: 0 auto; font-family: system-ui, sans-serif; color: #1a1a1a; padding: 20px; }
  </style>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="./main.ts"></script>
</body>
</html>
```

- [ ] **Step 2: Create history main.ts**

```typescript
// packages/extension/src/history/main.ts
import { mount } from "svelte";
import App from "./App.svelte";

mount(App, { target: document.getElementById("app")! });
```

- [ ] **Step 3: Create VisitCard.svelte**

```svelte
<!-- packages/extension/src/history/VisitCard.svelte -->
<script lang="ts">
  import type { Visit } from "@wikipedia-breadcrumbs/shared";
  import { formatCitation, CitationFormat } from "@wikipedia-breadcrumbs/shared";

  interface Props {
    visit: Visit;
    onUpdateNote: (visitId: string, note: string) => void;
  }

  let { visit, onUpdateNote }: Props = $props();

  let showCitation = $state(false);
  let editingNote = $state(false);
  let noteText = $state(visit.note ?? "");

  function formatTime(iso: string): string {
    return new Date(iso).toLocaleString();
  }

  function sourceLabel(type: string): string {
    const labels: Record<string, string> = {
      link: "Link", search: "Search", external: "External",
      manual: "Manual", share_target: "Shared",
    };
    return labels[type] ?? type;
  }

  async function copyCitation(format: CitationFormat) {
    const text = formatCitation(visit, format);
    await navigator.clipboard.writeText(text);
    showCitation = false;
  }

  function saveNote() {
    onUpdateNote(visit.id, noteText);
    editingNote = false;
  }

  const citationFormats = [
    { key: CitationFormat.Wikipedia, label: "Wikipedia" },
    { key: CitationFormat.APA, label: "APA" },
    { key: CitationFormat.MLA, label: "MLA" },
    { key: CitationFormat.Chicago, label: "Chicago" },
    { key: CitationFormat.BibTeX, label: "BibTeX" },
    { key: CitationFormat.Markdown, label: "Markdown" },
    { key: CitationFormat.URL, label: "URL" },
  ];
</script>

<div class="visit-card">
  <div class="main">
    <a href={visit.url} target="_blank" class="title">{visit.title}</a>
    <div class="meta">
      <span class="badge">{sourceLabel(visit.sourceType)}</span>
      {#if visit.sourceDetail}
        <span class="detail">via "{visit.sourceDetail}"</span>
      {/if}
      <span class="time">{formatTime(visit.timestamp)}</span>
    </div>
  </div>

  <div class="actions">
    {#if editingNote}
      <div class="note-edit">
        <input bind:value={noteText} placeholder="Add a note..." onkeydown={(e) => e.key === "Enter" && saveNote()} />
        <button onclick={saveNote}>Save</button>
      </div>
    {:else}
      <button class="note-btn" onclick={() => { editingNote = true; }}>
        {visit.note ? `Note: ${visit.note}` : "Add note"}
      </button>
    {/if}
    <button class="cite-btn" onclick={() => showCitation = !showCitation}>Cite</button>
  </div>

  {#if showCitation}
    <div class="citation-picker">
      {#each citationFormats as fmt}
        <button onclick={() => copyCitation(fmt.key)}>{fmt.label}</button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .visit-card { padding: 10px 0; border-bottom: 1px solid #eee; }
  .title { color: #0066cc; text-decoration: none; font-size: 15px; font-weight: 500; }
  .title:hover { text-decoration: underline; }
  .meta { font-size: 12px; color: #666; margin-top: 4px; display: flex; gap: 8px; align-items: center; }
  .badge { background: #e8f0fe; color: #1a73e8; padding: 1px 6px; border-radius: 3px; font-size: 11px; }
  .detail { font-style: italic; }
  .actions { display: flex; gap: 8px; margin-top: 6px; }
  .note-btn, .cite-btn { font-size: 12px; padding: 2px 8px; border: 1px solid #ddd; border-radius: 3px; background: white; cursor: pointer; }
  .note-edit { display: flex; gap: 4px; }
  .note-edit input { font-size: 12px; padding: 2px 6px; border: 1px solid #ccc; border-radius: 3px; width: 200px; }
  .citation-picker { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
  .citation-picker button { font-size: 12px; padding: 3px 10px; border: 1px solid #ddd; border-radius: 3px; background: #f8f8f8; cursor: pointer; }
  .citation-picker button:hover { background: #e8f0fe; }
</style>
```

- [ ] **Step 4: Commit**

```bash
git add packages/extension/src/history/index.html packages/extension/src/history/main.ts packages/extension/src/history/VisitCard.svelte
git commit -m "feat(extension): add history page setup and VisitCard component"
```

---

### Task 16: TrailDetail Component

**Files:**
- Create: `packages/extension/src/history/TrailDetail.svelte`

- [ ] **Step 1: Create TrailDetail.svelte**

```svelte
<!-- packages/extension/src/history/TrailDetail.svelte -->
<script lang="ts">
  import type { Trail, Visit } from "@wikipedia-breadcrumbs/shared";
  import {
    BreadcrumbsDB,
    visitStore,
    trailStore,
    splitTrail,
    mergeTrails,
  } from "@wikipedia-breadcrumbs/shared";
  import VisitCard from "./VisitCard.svelte";

  interface Props {
    trail: Trail;
    onBack: () => void;
    onMutated: () => void;
  }

  let { trail, onBack, onMutated }: Props = $props();

  let visits: Visit[] = $state([]);
  let editingName = $state(false);
  let nameText = $state(trail.name ?? "");
  let isStarred = $state(trail.isStarred);
  let displayName = $state(trail.name);
  let showMergePicker = $state(false);
  let allTrails: Trail[] = $state([]);

  const db = new BreadcrumbsDB();
  const visitOps = visitStore(db);
  const trailOps = trailStore(db);

  async function loadVisits() {
    visits = await visitOps.getByTrailId(trail.id);
  }

  async function saveName() {
    if (nameText.trim()) {
      await trailOps.update(trail.id, { name: nameText.trim() });
      displayName = nameText.trim();
      chrome.runtime.sendMessage({ type: "trailMutated", trailId: trail.id });
    }
    editingName = false;
  }

  async function toggleStar() {
    isStarred = !isStarred;
    await trailOps.update(trail.id, { isStarred });
  }

  async function openMergePicker() {
    allTrails = (await trailOps.getAll()).filter((t) => t.id !== trail.id);
    showMergePicker = true;
  }

  async function handleMerge(secondaryId: string) {
    await mergeTrails(db, trail.id, secondaryId);
    chrome.runtime.sendMessage({ type: "trailMutated", trailId: trail.id });
    chrome.runtime.sendMessage({ type: "trailDeleted", trailId: secondaryId });
    showMergePicker = false;
    onMutated();
  }

  async function handleSplit(afterPosition: number) {
    await splitTrail(db, trail.id, afterPosition);
    chrome.runtime.sendMessage({ type: "trailMutated", trailId: trail.id });
    onMutated();
  }

  async function handleUpdateNote(visitId: string, note: string) {
    await visitOps.update(visitId, { note });
    await loadVisits();
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString();
  }

  loadVisits();
</script>

<div class="trail-detail">
  <button class="back" onclick={onBack}>&larr; Back to trails</button>

  <div class="header">
    {#if editingName}
      <input bind:value={nameText} onkeydown={(e) => e.key === "Enter" && saveName()} autofocus />
      <button onclick={saveName}>Save</button>
    {:else}
      <h2 onclick={() => { editingName = true; nameText = displayName ?? ""; }}>
        {displayName ?? `Trail (${visits.length} pages)`}
      </h2>
    {/if}
    <button class="star" onclick={toggleStar}>{isStarred ? "★" : "☆"}</button>
    <button class="merge-btn" onclick={openMergePicker}>Merge</button>
  </div>

  <div class="meta">
    <span>{formatDate(trail.startedAt)}</span>
    {#if trail.endedAt}
      <span> — {formatDate(trail.endedAt)}</span>
    {/if}
    <span> &middot; {visits.length} pages</span>
    <span class="status">{trail.status}</span>
  </div>

  <div class="timeline">
    {#each visits as visit, i}
      <VisitCard {visit} onUpdateNote={handleUpdateNote} />
      {#if i < visits.length - 1}
        <button class="split-btn" onclick={() => handleSplit(visit.position)}>
          ✂ Split here
        </button>
      {/if}
    {/each}
  </div>

  {#if showMergePicker}
    <div class="merge-picker">
      <h3>Merge with another trail:</h3>
      {#each allTrails as other}
        <button onclick={() => handleMerge(other.id)}>
          {other.name ?? `Trail from ${new Date(other.startedAt).toLocaleDateString()}`}
        </button>
      {/each}
      <button class="cancel" onclick={() => showMergePicker = false}>Cancel</button>
    </div>
  {/if}
</div>

<style>
  .trail-detail { max-width: 700px; }
  .back { background: none; border: none; color: #0066cc; cursor: pointer; padding: 0; margin-bottom: 16px; }
  .header { display: flex; align-items: center; gap: 12px; }
  .header h2 { margin: 0; cursor: pointer; }
  .header h2:hover { color: #0066cc; }
  .star { background: none; border: none; font-size: 20px; cursor: pointer; }
  .meta { font-size: 13px; color: #666; margin: 8px 0 16px; }
  .status { background: #e8f0fe; padding: 1px 6px; border-radius: 3px; font-size: 11px; }
  .split-btn { display: block; width: 100%; text-align: center; padding: 4px; border: 1px dashed #ddd; background: none; cursor: pointer; font-size: 12px; color: #999; margin: 2px 0; }
  .split-btn:hover { border-color: #0066cc; color: #0066cc; }
  .merge-btn { background: none; border: 1px solid #ddd; border-radius: 3px; padding: 4px 10px; cursor: pointer; font-size: 13px; }
  .merge-picker { margin-top: 16px; padding: 12px; border: 1px solid #ddd; border-radius: 4px; }
  .merge-picker h3 { margin: 0 0 8px; font-size: 14px; }
  .merge-picker button { display: block; width: 100%; text-align: left; padding: 6px 10px; margin: 4px 0; border: 1px solid #eee; border-radius: 3px; background: white; cursor: pointer; }
  .merge-picker button:hover { background: #f0f0f0; }
  .merge-picker .cancel { text-align: center; color: #999; border-style: dashed; }
  input { font-size: 16px; padding: 4px 8px; border: 1px solid #0066cc; border-radius: 4px; }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add packages/extension/src/history/TrailDetail.svelte
git commit -m "feat(extension): add TrailDetail component with split support"
```

---

### Task 17: TrailList + History App

**Files:**
- Create: `packages/extension/src/history/TrailList.svelte`
- Create: `packages/extension/src/history/App.svelte`

- [ ] **Step 1: Create TrailList.svelte**

```svelte
<!-- packages/extension/src/history/TrailList.svelte -->
<script lang="ts">
  import type { Trail, Visit } from "@wikipedia-breadcrumbs/shared";
  import { BreadcrumbsDB, trailStore, visitStore } from "@wikipedia-breadcrumbs/shared";

  interface TrailSummary {
    trail: Trail;
    visitCount: number;
    firstTitle: string;
    lastTitle: string;
  }

  interface Props {
    onSelectTrail: (trail: Trail) => void;
  }

  let { onSelectTrail }: Props = $props();

  let trails: TrailSummary[] = $state([]);
  let searchQuery = $state("");
  let sortBy: "recent" | "oldest" | "starred" = $state("recent");
  let loading = $state(true);

  const db = new BreadcrumbsDB();
  const trailOps = trailStore(db);
  const visitOps = visitStore(db);

  export async function refresh() {
    loading = true;
    const allTrails = await trailOps.getAll();
    const summaries: TrailSummary[] = [];

    for (const trail of allTrails) {
      const visits = await visitOps.getByTrailId(trail.id);
      summaries.push({
        trail,
        visitCount: visits.length,
        firstTitle: visits[0]?.title ?? "",
        lastTitle: visits[visits.length - 1]?.title ?? "",
      });
    }

    trails = summaries;
    loading = false;
  }

  const filteredTrails = $derived.by(() => {
    let result = trails;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (s) =>
          s.trail.name?.toLowerCase().includes(q) ||
          s.firstTitle.toLowerCase().includes(q) ||
          s.lastTitle.toLowerCase().includes(q)
      );
    }

    if (sortBy === "starred") {
      result = [...result].sort((a, b) => (b.trail.isStarred ? 1 : 0) - (a.trail.isStarred ? 1 : 0));
    } else if (sortBy === "oldest") {
      result = [...result].reverse();
    }

    return result;
  });

  async function toggleStar(trailId: string) {
    const summary = trails.find((s) => s.trail.id === trailId);
    if (!summary) return;
    summary.trail.isStarred = !summary.trail.isStarred;
    await trailOps.update(trailId, { isStarred: summary.trail.isStarred });
    trails = [...trails];
  }

  async function deleteTrail(trailId: string) {
    await trailOps.softDelete(trailId);
    chrome.runtime.sendMessage({ type: "trailDeleted", trailId });
    await refresh();
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString();
  }

  refresh();
</script>

<div class="trail-list">
  <div class="toolbar">
    <input
      type="text"
      placeholder="Search trails..."
      bind:value={searchQuery}
    />
    <select bind:value={sortBy}>
      <option value="recent">Most Recent</option>
      <option value="oldest">Oldest First</option>
      <option value="starred">Starred First</option>
    </select>
  </div>

  {#if loading}
    <p class="loading">Loading trails...</p>
  {:else if filteredTrails.length === 0}
    <p class="empty">
      {searchQuery ? "No trails match your search." : "No trails yet. Browse Wikipedia to start!"}
    </p>
  {:else}
    <ul class="trails">
      {#each filteredTrails as summary}
        <li>
          <button class="star" onclick={() => toggleStar(summary.trail.id)}>
            {summary.trail.isStarred ? "★" : "☆"}
          </button>
          <div class="trail-info" onclick={() => onSelectTrail(summary.trail)}>
            <span class="name">{summary.trail.name ?? `${summary.firstTitle} → ${summary.lastTitle}`}</span>
            <span class="meta">
              {summary.visitCount} pages &middot; {formatDate(summary.trail.startedAt)}
              {#if summary.trail.status === "active"}
                <span class="active-badge">Active</span>
              {/if}
            </span>
          </div>
          <button class="delete" onclick={() => deleteTrail(summary.trail.id)}>Delete</button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .trail-list { width: 100%; }
  .toolbar { display: flex; gap: 8px; margin-bottom: 16px; }
  .toolbar input { flex: 1; padding: 8px 12px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; }
  .toolbar select { padding: 8px; border: 1px solid #ccc; border-radius: 4px; }
  .trails { list-style: none; padding: 0; }
  .trails li { display: flex; align-items: center; gap: 8px; padding: 10px 0; border-bottom: 1px solid #eee; }
  .star { background: none; border: none; font-size: 18px; cursor: pointer; padding: 0 4px; }
  .trail-info { flex: 1; cursor: pointer; }
  .trail-info:hover .name { color: #0066cc; }
  .name { font-weight: 500; display: block; }
  .meta { font-size: 12px; color: #666; }
  .active-badge { background: #d4edda; color: #155724; padding: 1px 6px; border-radius: 3px; font-size: 11px; margin-left: 4px; }
  .delete { background: none; border: 1px solid #ddd; border-radius: 3px; padding: 4px 8px; font-size: 12px; cursor: pointer; color: #999; }
  .delete:hover { border-color: #dc3545; color: #dc3545; }
  .loading, .empty { text-align: center; color: #666; padding: 24px; }
</style>
```

- [ ] **Step 2: Create App.svelte**

```svelte
<!-- packages/extension/src/history/App.svelte -->
<script lang="ts">
  import type { Trail } from "@wikipedia-breadcrumbs/shared";
  import { BreadcrumbsDB, trailStore } from "@wikipedia-breadcrumbs/shared";
  import TrailList from "./TrailList.svelte";
  import TrailDetail from "./TrailDetail.svelte";

  let selectedTrail: Trail | null = $state(null);
  let trailListRef: TrailList;

  function selectTrail(trail: Trail) {
    selectedTrail = trail;
  }

  function backToList() {
    selectedTrail = null;
    trailListRef?.refresh();
  }

  // Check URL params for direct trail link from popup
  const params = new URLSearchParams(window.location.search);
  const directTrailId = params.get("trail");
  if (directTrailId) {
    const db = new BreadcrumbsDB();
    trailStore(db).getById(directTrailId).then((trail) => {
      if (trail) selectedTrail = trail;
    });
  }
</script>

<main>
  <h1>Wikipedia Breadcrumbs</h1>

  {#if selectedTrail}
    <TrailDetail trail={selectedTrail} onBack={backToList} onMutated={backToList} />
  {:else}
    <TrailList bind:this={trailListRef} onSelectTrail={selectTrail} />
  {/if}
</main>

<style>
  h1 { margin: 0 0 20px; font-size: 24px; }
</style>
```

- [ ] **Step 3: Run all tests**

Run: `cd packages/extension && pnpm test`
Expected: All tests pass

- [ ] **Step 4: Verify build**

Run: `cd packages/extension && pnpm build`
Expected: Build succeeds with all pages

- [ ] **Step 5: Commit**

```bash
git add packages/extension/src/history/
git commit -m "feat(extension): add history page with trail list, detail, and visit cards"
```

---

## Summary

This plan covers the complete Chrome extension phase 1:

**What this produces:**
- MV3 Chrome extension loadable via `chrome://extensions` (developer mode)
- Background service worker capturing Wikipedia navigation as trails
- Content script tracking link clicks for source context
- Offscreen document proxying IndexedDB operations
- Popup showing current tab's trail with start/end controls
- History page for browsing, searching, starring, splitting, deleting trails
- Options page for idle timeout and capture toggle
- Citation copy in 7 formats from visit cards

**Test coverage:**
- Messaging types, settings, device ID (unit tests)
- Offscreen handler (integration tests with fake-indexeddb)
- Trail manager state (unit tests)
- Capture orchestration (unit tests with mocked offscreen)
- Alarm manager (unit tests)
- Link tracker (unit tests)

**Minor items deferred to a fast follow-up:**
- TrailList bulk select for multi-delete (currently single-delete only)
- Deep visit search (currently filters by trail name + first/last title, not full visit text)

**To test the extension manually:**
1. `cd packages/extension && pnpm build`
2. Open `chrome://extensions`, enable Developer Mode
3. Click "Load unpacked", select `packages/extension/dist`
4. Navigate to any Wikipedia article — the extension should start recording
