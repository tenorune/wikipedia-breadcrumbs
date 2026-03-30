# Shared Library Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `packages/shared` library — the foundation that both the Chrome extension and PWA depend on — plus the monorepo scaffolding to support all three packages.

**Architecture:** pnpm monorepo with three workspace packages (`shared`, `extension`, `pwa`). The shared package is a pure TypeScript library exposing models, IndexedDB persistence (Dexie.js), Wikipedia URL utilities, trail detection/operations, and citation formatting. No UI code lives here. Offline-first — sync layer is deferred to a separate plan.

**Tech Stack:** TypeScript, pnpm workspaces, Vite (library mode), Vitest, Dexie.js, fake-indexeddb (testing)

**Spec reference:** `docs/superpowers/specs/2026-03-30-wikipedia-breadcrumbs-design.md`

---

## Chunk 1: Monorepo Scaffolding + TypeScript Models

### Task 1: Root Monorepo Configuration

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.json`
- Create: `.gitignore`

- [ ] **Step 1: Create root `package.json`**

```json
{
  "name": "wikipedia-breadcrumbs",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "pnpm -r test",
    "build": "pnpm -r build",
    "lint": "pnpm -r lint"
  },
  "devDependencies": {
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 2: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - "packages/*"
```

- [ ] **Step 3: Create root `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 4: Create `.gitignore`**

```
node_modules/
dist/
.env
.env.local
*.log
.DS_Store
coverage/
```

- [ ] **Step 5: Install dependencies and verify**

Run: `pnpm install`
Expected: lockfile created, no errors

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.json .gitignore pnpm-lock.yaml
git commit -m "chore: scaffold root monorepo config"
```

---

### Task 2: Shared Package Scaffold

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/vite.config.ts`
- Create: `packages/shared/src/index.ts`

- [ ] **Step 1: Create `packages/shared/package.json`**

```json
{
  "name": "@wikipedia-breadcrumbs/shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "vite build",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "dexie": "^4.0.0"
  },
  "devDependencies": {
    "vite": "^6.0.0",
    "vite-plugin-dts": "^4.0.0",
    "vitest": "^3.0.0",
    "fake-indexeddb": "^6.0.0"
  }
}
```

- [ ] **Step 2: Create `packages/shared/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Create `packages/shared/vite.config.ts`**

```typescript
/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
  build: {
    lib: {
      entry: "src/index.ts",
      formats: ["es"],
      fileName: "index",
    },
    rollupOptions: {
      external: ["dexie"],
    },
  },
  plugins: [dts({ rollupTypes: true })],
  test: {
    globals: true,
    setupFiles: ["./tests/setup.ts"],
  },
});
```

- [ ] **Step 4: Create `packages/shared/tests/setup.ts`**

```typescript
import "fake-indexeddb/auto";
```

- [ ] **Step 5: Create placeholder `packages/shared/src/index.ts`**

```typescript
// @wikipedia-breadcrumbs/shared
// Core library for Wikipedia Breadcrumbs
```

- [ ] **Step 6: Install dependencies**

Run: `cd packages/shared && pnpm install`
Expected: dependencies resolve, no errors

- [ ] **Step 7: Verify build works**

Run: `pnpm build` (from `packages/shared`)
Expected: `dist/index.js` created

- [ ] **Step 8: Commit**

```bash
git add packages/shared/
git commit -m "chore: scaffold shared package with vite + vitest"
```

---

### Task 3: Enum Types

**Files:**
- Create: `packages/shared/src/models/enums.ts`
- Test: `packages/shared/tests/models/enums.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// packages/shared/tests/models/enums.test.ts
import { describe, it, expect } from "vitest";
import {
  SourceType,
  SyncStatus,
  TrailStatus,
  Visibility,
  StartReason,
  CitationFormat,
} from "../../src/models/enums.js";

describe("enums", () => {
  it("SourceType has all expected values", () => {
    expect(SourceType.Link).toBe("link");
    expect(SourceType.Search).toBe("search");
    expect(SourceType.External).toBe("external");
    expect(SourceType.Manual).toBe("manual");
    expect(SourceType.ShareTarget).toBe("share_target");
  });

  it("SyncStatus has all expected values", () => {
    expect(SyncStatus.LocalOnly).toBe("local_only");
    expect(SyncStatus.Synced).toBe("synced");
    expect(SyncStatus.PendingSync).toBe("pending_sync");
  });

  it("TrailStatus has all expected values", () => {
    expect(TrailStatus.Active).toBe("active");
    expect(TrailStatus.Finalized).toBe("finalized");
  });

  it("Visibility has all expected values", () => {
    expect(Visibility.Private).toBe("private");
    expect(Visibility.Unlisted).toBe("unlisted");
    expect(Visibility.Public).toBe("public");
  });

  it("StartReason has all expected values", () => {
    expect(StartReason.AutoNewTab).toBe("auto_new_tab");
    expect(StartReason.AutoTimeout).toBe("auto_timeout");
    expect(StartReason.AutoExternal).toBe("auto_external");
    expect(StartReason.AutoSearch).toBe("auto_search");
    expect(StartReason.AutoMainPage).toBe("auto_main_page");
    expect(StartReason.Manual).toBe("manual");
    expect(StartReason.Forked).toBe("forked");
  });

  it("CitationFormat has all expected values", () => {
    expect(CitationFormat.Wikipedia).toBe("wikipedia");
    expect(CitationFormat.APA).toBe("apa");
    expect(CitationFormat.MLA).toBe("mla");
    expect(CitationFormat.Chicago).toBe("chicago");
    expect(CitationFormat.BibTeX).toBe("bibtex");
    expect(CitationFormat.URL).toBe("url");
    expect(CitationFormat.Markdown).toBe("markdown");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/shared && pnpm test -- tests/models/enums.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement enums**

```typescript
// packages/shared/src/models/enums.ts

export const SourceType = {
  Link: "link",
  Search: "search",
  External: "external",
  Manual: "manual",
  ShareTarget: "share_target",
} as const;
export type SourceType = (typeof SourceType)[keyof typeof SourceType];

export const SyncStatus = {
  LocalOnly: "local_only",
  Synced: "synced",
  PendingSync: "pending_sync",
} as const;
export type SyncStatus = (typeof SyncStatus)[keyof typeof SyncStatus];

export const TrailStatus = {
  Active: "active",
  Finalized: "finalized",
} as const;
export type TrailStatus = (typeof TrailStatus)[keyof typeof TrailStatus];

export const Visibility = {
  Private: "private",
  Unlisted: "unlisted",
  Public: "public",
} as const;
export type Visibility = (typeof Visibility)[keyof typeof Visibility];

export const StartReason = {
  AutoNewTab: "auto_new_tab",
  AutoTimeout: "auto_timeout",
  AutoExternal: "auto_external",
  AutoSearch: "auto_search",
  AutoMainPage: "auto_main_page",
  Manual: "manual",
  Forked: "forked",
} as const;
export type StartReason = (typeof StartReason)[keyof typeof StartReason];

export const CitationFormat = {
  Wikipedia: "wikipedia",
  APA: "apa",
  MLA: "mla",
  Chicago: "chicago",
  BibTeX: "bibtex",
  URL: "url",
  Markdown: "markdown",
} as const;
export type CitationFormat = (typeof CitationFormat)[keyof typeof CitationFormat];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/shared && pnpm test -- tests/models/enums.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/models/enums.ts packages/shared/tests/models/enums.test.ts
git commit -m "feat(shared): add enum types for data model"
```

---

### Task 4: Visit Model

**Files:**
- Create: `packages/shared/src/models/visit.ts`
- Test: `packages/shared/tests/models/visit.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// packages/shared/tests/models/visit.test.ts
import { describe, it, expect } from "vitest";
import { createVisit } from "../../src/models/visit.js";
import type { Visit } from "../../src/models/visit.js";
import { SourceType, SyncStatus } from "../../src/models/enums.js";

describe("Visit", () => {
  it("createVisit returns a Visit with required fields and defaults", () => {
    const visit = createVisit({
      trailId: "trail-123",
      url: "https://en.wikipedia.org/wiki/Rust_(programming_language)",
      title: "Rust (programming language)",
      position: 1,
      sourceType: SourceType.Link,
      language: "en",
      articleId: "46765424",
    });

    expect(visit.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
    expect(visit.trailId).toBe("trail-123");
    expect(visit.url).toBe(
      "https://en.wikipedia.org/wiki/Rust_(programming_language)"
    );
    expect(visit.title).toBe("Rust (programming language)");
    expect(visit.position).toBe(1);
    expect(visit.sourceType).toBe(SourceType.Link);
    expect(visit.language).toBe("en");
    expect(visit.articleId).toBe("46765424");
    expect(visit.syncStatus).toBe(SyncStatus.LocalOnly);
    expect(visit.timestamp).toBeDefined();
    expect(visit.updatedAt).toBeDefined();
    expect(visit.sourceDetail).toBeNull();
    expect(visit.tabId).toBeNull();
    expect(visit.windowId).toBeNull();
    expect(visit.note).toBeNull();
    expect(visit.summary).toBeNull();
    expect(visit.thumbnailUrl).toBeNull();
    expect(visit.deletedAt).toBeNull();
  });

  it("createVisit accepts optional fields", () => {
    const visit = createVisit({
      trailId: "trail-123",
      url: "https://en.wikipedia.org/wiki/Rust_(programming_language)",
      title: "Rust (programming language)",
      position: 1,
      sourceType: SourceType.Search,
      language: "en",
      articleId: "46765424",
      sourceDetail: "rust programming",
      tabId: 42,
      windowId: 1,
      note: "Interesting article",
    });

    expect(visit.sourceDetail).toBe("rust programming");
    expect(visit.tabId).toBe(42);
    expect(visit.windowId).toBe(1);
    expect(visit.note).toBe("Interesting article");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/shared && pnpm test -- tests/models/visit.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement Visit model**

```typescript
// packages/shared/src/models/visit.ts
import type { SourceType, SyncStatus } from "./enums.js";
import { SyncStatus as SyncStatusEnum } from "./enums.js";

export interface Visit {
  id: string;
  trailId: string;
  url: string;
  title: string;
  timestamp: string;
  position: number;
  sourceType: SourceType;
  sourceDetail: string | null;
  tabId: number | null;
  windowId: number | null;
  note: string | null;
  summary: string | null;
  thumbnailUrl: string | null;
  language: string;
  articleId: string;
  syncStatus: SyncStatus;
  updatedAt: string;
  deletedAt: string | null;
}

export interface CreateVisitInput {
  trailId: string;
  url: string;
  title: string;
  position: number;
  sourceType: SourceType;
  language: string;
  articleId: string;
  sourceDetail?: string | null;
  tabId?: number | null;
  windowId?: number | null;
  note?: string | null;
  summary?: string | null;
  thumbnailUrl?: string | null;
}

export function createVisit(input: CreateVisitInput): Visit {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    trailId: input.trailId,
    url: input.url,
    title: input.title,
    timestamp: now,
    position: input.position,
    sourceType: input.sourceType,
    sourceDetail: input.sourceDetail ?? null,
    tabId: input.tabId ?? null,
    windowId: input.windowId ?? null,
    note: input.note ?? null,
    summary: input.summary ?? null,
    thumbnailUrl: input.thumbnailUrl ?? null,
    language: input.language,
    articleId: input.articleId,
    syncStatus: SyncStatusEnum.LocalOnly,
    updatedAt: now,
    deletedAt: null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/shared && pnpm test -- tests/models/visit.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/models/visit.ts packages/shared/tests/models/visit.test.ts
git commit -m "feat(shared): add Visit model and factory"
```

---

### Task 5: Trail Model

**Files:**
- Create: `packages/shared/src/models/trail.ts`
- Test: `packages/shared/tests/models/trail.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// packages/shared/tests/models/trail.test.ts
import { describe, it, expect } from "vitest";
import { createTrail } from "../../src/models/trail.js";
import type { Trail } from "../../src/models/trail.js";
import {
  TrailStatus,
  Visibility,
  StartReason,
  SyncStatus,
} from "../../src/models/enums.js";

describe("Trail", () => {
  it("createTrail returns a Trail with required fields and defaults", () => {
    const trail = createTrail({
      startReason: StartReason.AutoNewTab,
      deviceId: "device-abc",
    });

    expect(trail.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
    expect(trail.userId).toBeNull();
    expect(trail.name).toBeNull();
    expect(trail.status).toBe(TrailStatus.Active);
    expect(trail.isStarred).toBe(false);
    expect(trail.tags).toEqual([]);
    expect(trail.visibility).toBe(Visibility.Private);
    expect(trail.deviceId).toBe("device-abc");
    expect(trail.forkedFromVisitId).toBeNull();
    expect(trail.startReason).toBe(StartReason.AutoNewTab);
    expect(trail.syncStatus).toBe(SyncStatus.LocalOnly);
    expect(trail.createdAt).toBeDefined();
    expect(trail.startedAt).toBeDefined();
    expect(trail.endedAt).toBeNull();
    expect(trail.deletedAt).toBeNull();
  });

  it("createTrail with forked reason requires forkedFromVisitId", () => {
    const trail = createTrail({
      startReason: StartReason.Forked,
      deviceId: "device-abc",
      forkedFromVisitId: "visit-xyz",
    });

    expect(trail.startReason).toBe(StartReason.Forked);
    expect(trail.forkedFromVisitId).toBe("visit-xyz");
  });

  it("throws if startReason is Forked but forkedFromVisitId is missing", () => {
    expect(() =>
      createTrail({
        startReason: StartReason.Forked,
        deviceId: "device-abc",
      })
    ).toThrow("forkedFromVisitId is required when startReason is forked");
  });

  it("throws if forkedFromVisitId is provided but startReason is not Forked", () => {
    expect(() =>
      createTrail({
        startReason: StartReason.AutoNewTab,
        deviceId: "device-abc",
        forkedFromVisitId: "visit-xyz",
      })
    ).toThrow("forkedFromVisitId must only be set when startReason is forked");
  });

  it("createTrail accepts optional fields", () => {
    const trail = createTrail({
      startReason: StartReason.Manual,
      deviceId: "device-abc",
      name: "My Research Trail",
      userId: "user-123",
      tags: ["history", "science"],
    });

    expect(trail.name).toBe("My Research Trail");
    expect(trail.userId).toBe("user-123");
    expect(trail.tags).toEqual(["history", "science"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/shared && pnpm test -- tests/models/trail.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement Trail model**

```typescript
// packages/shared/src/models/trail.ts
import type {
  TrailStatus,
  Visibility,
  StartReason,
  SyncStatus,
} from "./enums.js";
import {
  TrailStatus as TrailStatusEnum,
  Visibility as VisibilityEnum,
  SyncStatus as SyncStatusEnum,
} from "./enums.js";

export interface Trail {
  id: string;
  userId: string | null;
  name: string | null;
  createdAt: string;
  startedAt: string;
  endedAt: string | null;
  status: TrailStatus;
  isStarred: boolean;
  tags: string[];
  visibility: Visibility;
  deviceId: string;
  forkedFromVisitId: string | null;
  startReason: StartReason;
  syncStatus: SyncStatus;
  updatedAt: string;
  deletedAt: string | null;
}

export interface CreateTrailInput {
  startReason: StartReason;
  deviceId: string;
  userId?: string | null;
  name?: string | null;
  forkedFromVisitId?: string | null;
  tags?: string[];
}

export function createTrail(input: CreateTrailInput): Trail {
  const isForked = input.startReason === "forked";
  const hasForkedVisit = input.forkedFromVisitId != null;
  if (isForked && !hasForkedVisit) {
    throw new Error("forkedFromVisitId is required when startReason is forked");
  }
  if (!isForked && hasForkedVisit) {
    throw new Error("forkedFromVisitId must only be set when startReason is forked");
  }

  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    userId: input.userId ?? null,
    name: input.name ?? null,
    createdAt: now,
    startedAt: now,
    endedAt: null,
    status: TrailStatusEnum.Active,
    isStarred: false,
    tags: input.tags ?? [],
    visibility: VisibilityEnum.Private,
    deviceId: input.deviceId,
    forkedFromVisitId: input.forkedFromVisitId ?? null,
    startReason: input.startReason,
    syncStatus: SyncStatusEnum.LocalOnly,
    updatedAt: now,
    deletedAt: null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/shared && pnpm test -- tests/models/trail.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/models/trail.ts packages/shared/tests/models/trail.test.ts
git commit -m "feat(shared): add Trail model and factory"
```

---

### Task 6: User and ConflictLog Models + Models Index

**Files:**
- Create: `packages/shared/src/models/user.ts`
- Create: `packages/shared/src/models/conflict-log.ts`
- Create: `packages/shared/src/models/index.ts`
- Test: `packages/shared/tests/models/index.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// packages/shared/tests/models/index.test.ts
import { describe, it, expect } from "vitest";
import {
  SourceType,
  SyncStatus,
  TrailStatus,
  Visibility,
  StartReason,
  CitationFormat,
  createVisit,
  createTrail,
} from "../../src/models/index.js";
import type {
  Visit,
  Trail,
  User,
  ConflictLog,
} from "../../src/models/index.js";

describe("models index", () => {
  it("re-exports all enums", () => {
    expect(SourceType.Link).toBe("link");
    expect(SyncStatus.LocalOnly).toBe("local_only");
    expect(TrailStatus.Active).toBe("active");
    expect(Visibility.Private).toBe("private");
    expect(StartReason.Manual).toBe("manual");
    expect(CitationFormat.APA).toBe("apa");
  });

  it("re-exports factory functions", () => {
    expect(typeof createVisit).toBe("function");
    expect(typeof createTrail).toBe("function");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/shared && pnpm test -- tests/models/index.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement User type**

```typescript
// packages/shared/src/models/user.ts
export interface User {
  id: string;
  displayName: string;
  createdAt: string;
}
```

- [ ] **Step 4: Implement ConflictLog type**

```typescript
// packages/shared/src/models/conflict-log.ts
export interface ConflictLog {
  id: string;
  recordType: "visit" | "trail";
  recordId: string;
  losingSnapshot: Record<string, unknown>;
  winningSnapshot: Record<string, unknown>;
  resolvedAt: string | null;
  createdAt: string;
}
```

- [ ] **Step 5: Create models index**

```typescript
// packages/shared/src/models/index.ts
export {
  SourceType,
  SyncStatus,
  TrailStatus,
  Visibility,
  StartReason,
  CitationFormat,
} from "./enums.js";

export { createVisit } from "./visit.js";
export type { Visit, CreateVisitInput } from "./visit.js";

export { createTrail } from "./trail.js";
export type { Trail, CreateTrailInput } from "./trail.js";

export type { User } from "./user.js";
export type { ConflictLog } from "./conflict-log.js";
```

- [ ] **Step 6: Update `packages/shared/src/index.ts` to re-export models**

```typescript
// packages/shared/src/index.ts
export * from "./models/index.js";
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd packages/shared && pnpm test -- tests/models/index.test.ts`
Expected: PASS

- [ ] **Step 8: Run all tests**

Run: `cd packages/shared && pnpm test`
Expected: All tests pass (enums, visit, trail, index)

- [ ] **Step 9: Commit**

```bash
git add packages/shared/src/models/ packages/shared/tests/models/ packages/shared/src/index.ts
git commit -m "feat(shared): add User, ConflictLog types and models index"
```

---

## Chunk 2: Wikipedia URL Utilities + Database Layer

### Task 7: Wikipedia URL Parser

**Files:**
- Create: `packages/shared/src/wikipedia/url-parser.ts`
- Create: `packages/shared/src/wikipedia/index.ts`
- Test: `packages/shared/tests/wikipedia/url-parser.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// packages/shared/tests/wikipedia/url-parser.test.ts
import { describe, it, expect } from "vitest";
import {
  isWikipediaUrl,
  parseWikipediaUrl,
  cleanWikipediaUrl,
} from "../../src/wikipedia/url-parser.js";

describe("isWikipediaUrl", () => {
  it("returns true for standard Wikipedia article URLs", () => {
    expect(isWikipediaUrl("https://en.wikipedia.org/wiki/Rust_(programming_language)")).toBe(true);
    expect(isWikipediaUrl("https://fr.wikipedia.org/wiki/Paris")).toBe(true);
    expect(isWikipediaUrl("https://ja.wikipedia.org/wiki/東京")).toBe(true);
  });

  it("returns true for Simple English Wikipedia", () => {
    expect(isWikipediaUrl("https://simple.wikipedia.org/wiki/Rust")).toBe(true);
  });

  it("returns true for mobile Wikipedia URLs", () => {
    expect(isWikipediaUrl("https://en.m.wikipedia.org/wiki/Rust_(programming_language)")).toBe(true);
  });

  it("returns false for non-Wikipedia URLs", () => {
    expect(isWikipediaUrl("https://google.com")).toBe(false);
    expect(isWikipediaUrl("https://en.wiktionary.org/wiki/rust")).toBe(false);
  });

  it("returns false for Wikipedia non-article pages", () => {
    expect(isWikipediaUrl("https://en.wikipedia.org/wiki/Special:Search")).toBe(false);
    expect(isWikipediaUrl("https://en.wikipedia.org/wiki/Wikipedia:About")).toBe(false);
    expect(isWikipediaUrl("https://en.wikipedia.org/wiki/Help:Contents")).toBe(false);
    expect(isWikipediaUrl("https://en.wikipedia.org/wiki/Talk:Rust")).toBe(false);
    expect(isWikipediaUrl("https://en.wikipedia.org/wiki/User:Example")).toBe(false);
    expect(isWikipediaUrl("https://en.wikipedia.org/wiki/Category:Programming_languages")).toBe(false);
  });

  it("returns true for Wikipedia Main Page", () => {
    expect(isWikipediaUrl("https://en.wikipedia.org/wiki/Main_Page")).toBe(true);
  });
});

describe("parseWikipediaUrl", () => {
  it("extracts language, title, and cleaned URL from a standard URL", () => {
    const result = parseWikipediaUrl(
      "https://en.wikipedia.org/wiki/Rust_(programming_language)"
    );
    expect(result).toEqual({
      language: "en",
      title: "Rust (programming language)",
      cleanUrl: "https://en.wikipedia.org/wiki/Rust_(programming_language)",
    });
  });

  it("extracts language from non-English wikis", () => {
    const result = parseWikipediaUrl("https://fr.wikipedia.org/wiki/Paris");
    expect(result).toEqual({
      language: "fr",
      title: "Paris",
      cleanUrl: "https://fr.wikipedia.org/wiki/Paris",
    });
  });

  it("normalizes mobile URLs to desktop", () => {
    const result = parseWikipediaUrl(
      "https://en.m.wikipedia.org/wiki/Rust_(programming_language)"
    );
    expect(result).toEqual({
      language: "en",
      title: "Rust (programming language)",
      cleanUrl: "https://en.wikipedia.org/wiki/Rust_(programming_language)",
    });
  });

  it("strips query parameters and fragments", () => {
    const result = parseWikipediaUrl(
      "https://en.wikipedia.org/wiki/Rust_(programming_language)?action=edit#History"
    );
    expect(result).toEqual({
      language: "en",
      title: "Rust (programming language)",
      cleanUrl: "https://en.wikipedia.org/wiki/Rust_(programming_language)",
    });
  });

  it("decodes percent-encoded titles", () => {
    const result = parseWikipediaUrl(
      "https://en.wikipedia.org/wiki/Caf%C3%A9"
    );
    expect(result).toEqual({
      language: "en",
      title: "Cafe\u0301",
      cleanUrl: "https://en.wikipedia.org/wiki/Caf%C3%A9",
    });
  });

  it("replaces underscores with spaces in title", () => {
    const result = parseWikipediaUrl(
      "https://en.wikipedia.org/wiki/United_States"
    );
    expect(result).toEqual({
      language: "en",
      title: "United States",
      cleanUrl: "https://en.wikipedia.org/wiki/United_States",
    });
  });

  it("returns null for non-Wikipedia URLs", () => {
    expect(parseWikipediaUrl("https://google.com")).toBeNull();
  });

  it("returns null for non-article pages", () => {
    expect(parseWikipediaUrl("https://en.wikipedia.org/wiki/Special:Search")).toBeNull();
  });

  it("handles Main_Page", () => {
    const result = parseWikipediaUrl("https://en.wikipedia.org/wiki/Main_Page");
    expect(result).toEqual({
      language: "en",
      title: "Main Page",
      cleanUrl: "https://en.wikipedia.org/wiki/Main_Page",
    });
  });
});

describe("cleanWikipediaUrl", () => {
  it("removes query params and fragments", () => {
    expect(
      cleanWikipediaUrl(
        "https://en.wikipedia.org/wiki/Rust_(programming_language)?oldid=123#section"
      )
    ).toBe("https://en.wikipedia.org/wiki/Rust_(programming_language)");
  });

  it("converts mobile to desktop", () => {
    expect(
      cleanWikipediaUrl(
        "https://en.m.wikipedia.org/wiki/Rust_(programming_language)"
      )
    ).toBe("https://en.wikipedia.org/wiki/Rust_(programming_language)");
  });

  it("returns the URL unchanged if already clean", () => {
    expect(
      cleanWikipediaUrl("https://en.wikipedia.org/wiki/Rust_(programming_language)")
    ).toBe("https://en.wikipedia.org/wiki/Rust_(programming_language)");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/shared && pnpm test -- tests/wikipedia/url-parser.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the URL parser**

```typescript
// packages/shared/src/wikipedia/url-parser.ts

const WIKIPEDIA_REGEX = /^https?:\/\/([a-z]{2,})\.(?:m\.)?wikipedia\.org\/wiki\/(.+)$/;

const NON_ARTICLE_PREFIXES = [
  "Special:",
  "Wikipedia:",
  "Help:",
  "Talk:",
  "User:",
  "User_talk:",
  "Category:",
  "File:",
  "Template:",
  "Portal:",
  "Draft:",
  "Module:",
  "MediaWiki:",
];

export interface ParsedWikipediaUrl {
  language: string;
  title: string;
  cleanUrl: string;
}

function extractParts(url: string): { language: string; rawTitle: string } | null {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    const pathname = urlObj.pathname;

    const hostMatch = hostname.match(/^([a-z]{2,})\.(?:m\.)?wikipedia\.org$/);
    if (!hostMatch) return null;

    const wikiPrefix = "/wiki/";
    if (!pathname.startsWith(wikiPrefix)) return null;

    const rawTitle = pathname.slice(wikiPrefix.length);
    if (!rawTitle) return null;

    return { language: hostMatch[1], rawTitle };
  } catch {
    return null;
  }
}

function isArticlePage(rawTitle: string): boolean {
  return !NON_ARTICLE_PREFIXES.some((prefix) => rawTitle.startsWith(prefix));
}

export function isWikipediaUrl(url: string): boolean {
  const parts = extractParts(url);
  if (!parts) return false;
  return isArticlePage(parts.rawTitle);
}

export function cleanWikipediaUrl(url: string): string {
  const parts = extractParts(url);
  if (!parts) return url;
  return `https://${parts.language}.wikipedia.org/wiki/${parts.rawTitle}`;
}

export function parseWikipediaUrl(url: string): ParsedWikipediaUrl | null {
  const parts = extractParts(url);
  if (!parts) return null;
  if (!isArticlePage(parts.rawTitle)) return null;

  const title = decodeURIComponent(parts.rawTitle).replaceAll("_", " ");
  const cleanUrl = `https://${parts.language}.wikipedia.org/wiki/${parts.rawTitle}`;

  return { language: parts.language, title, cleanUrl };
}
```

- [ ] **Step 4: Create wikipedia index**

```typescript
// packages/shared/src/wikipedia/index.ts
export {
  isWikipediaUrl,
  parseWikipediaUrl,
  cleanWikipediaUrl,
} from "./url-parser.js";
export type { ParsedWikipediaUrl } from "./url-parser.js";
```

- [ ] **Step 5: Update `packages/shared/src/index.ts`**

```typescript
// packages/shared/src/index.ts
export * from "./models/index.js";
export * from "./wikipedia/index.js";
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd packages/shared && pnpm test -- tests/wikipedia/url-parser.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/wikipedia/ packages/shared/tests/wikipedia/ packages/shared/src/index.ts
git commit -m "feat(shared): add Wikipedia URL parser and utilities"
```

---

### Task 8: Dexie Database Schema

**Files:**
- Create: `packages/shared/src/db/schema.ts`
- Create: `packages/shared/src/db/index.ts`
- Test: `packages/shared/tests/db/schema.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// packages/shared/tests/db/schema.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { BreadcrumbsDB } from "../../src/db/schema.js";

describe("BreadcrumbsDB", () => {
  let db: BreadcrumbsDB;

  beforeEach(async () => {
    db = new BreadcrumbsDB("test-db-" + crypto.randomUUID());
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it("creates visits table with correct indexes", () => {
    const visitTable = db.table("visits");
    expect(visitTable).toBeDefined();
    expect(visitTable.schema.primKey.keyPath).toBe("id");
  });

  it("creates trails table with correct indexes", () => {
    const trailTable = db.table("trails");
    expect(trailTable).toBeDefined();
    expect(trailTable.schema.primKey.keyPath).toBe("id");
  });

  it("creates conflictLogs table", () => {
    const table = db.table("conflictLogs");
    expect(table).toBeDefined();
    expect(table.schema.primKey.keyPath).toBe("id");
  });

  it("can store and retrieve a visit", async () => {
    const visit = {
      id: crypto.randomUUID(),
      trailId: "trail-1",
      url: "https://en.wikipedia.org/wiki/Test",
      title: "Test",
      timestamp: new Date().toISOString(),
      position: 1,
      sourceType: "link",
      sourceDetail: null,
      tabId: null,
      windowId: null,
      note: null,
      summary: null,
      thumbnailUrl: null,
      language: "en",
      articleId: "123",
      syncStatus: "local_only",
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    };

    await db.visits.add(visit);
    const retrieved = await db.visits.get(visit.id);
    expect(retrieved).toEqual(visit);
  });

  it("can query visits by trailId", async () => {
    const trailId = "trail-1";
    const visit1 = {
      id: crypto.randomUUID(),
      trailId,
      url: "https://en.wikipedia.org/wiki/A",
      title: "A",
      timestamp: new Date().toISOString(),
      position: 1,
      sourceType: "link",
      sourceDetail: null,
      tabId: null,
      windowId: null,
      note: null,
      summary: null,
      thumbnailUrl: null,
      language: "en",
      articleId: "1",
      syncStatus: "local_only",
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    };
    const visit2 = { ...visit1, id: crypto.randomUUID(), position: 2, title: "B", url: "https://en.wikipedia.org/wiki/B", articleId: "2" };

    await db.visits.bulkAdd([visit1, visit2]);
    const results = await db.visits.where("trailId").equals(trailId).toArray();
    expect(results).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/shared && pnpm test -- tests/db/schema.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the Dexie schema**

```typescript
// packages/shared/src/db/schema.ts
import Dexie from "dexie";
import type { Table } from "dexie";
import type { Visit } from "../models/visit.js";
import type { Trail } from "../models/trail.js";
import type { ConflictLog } from "../models/conflict-log.js";

export class BreadcrumbsDB extends Dexie {
  visits!: Table<Visit, string>;
  trails!: Table<Trail, string>;
  conflictLogs!: Table<ConflictLog, string>;

  constructor(name = "breadcrumbs") {
    super(name);

    this.version(1).stores({
      visits: "id, trailId, [trailId+position], timestamp, syncStatus, articleId, deletedAt",
      trails: "id, userId, status, startedAt, syncStatus, deviceId, deletedAt",
      conflictLogs: "id, recordType, recordId, resolvedAt, createdAt",
    });
  }
}
```

- [ ] **Step 4: Create db index**

```typescript
// packages/shared/src/db/index.ts
export { BreadcrumbsDB } from "./schema.js";
```

- [ ] **Step 5: Update `packages/shared/src/index.ts`**

Add to the end of `packages/shared/src/index.ts`:
```typescript
export * from "./db/index.js";
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd packages/shared && pnpm test -- tests/db/schema.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/db/ packages/shared/tests/db/ packages/shared/src/index.ts
git commit -m "feat(shared): add Dexie database schema with Visit, Trail, ConflictLog tables"
```

---

### Task 9: Visit CRUD Operations

**Files:**
- Create: `packages/shared/src/db/visits.ts`
- Modify: `packages/shared/src/db/index.ts`
- Test: `packages/shared/tests/db/visits.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// packages/shared/tests/db/visits.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { BreadcrumbsDB } from "../../src/db/schema.js";
import { visitStore } from "../../src/db/visits.js";
import { createVisit } from "../../src/models/visit.js";
import { SourceType, SyncStatus } from "../../src/models/enums.js";

describe("visitStore", () => {
  let db: BreadcrumbsDB;
  let store: ReturnType<typeof visitStore>;

  const makeVisit = (overrides: Record<string, unknown> = {}) =>
    createVisit({
      trailId: "trail-1",
      url: "https://en.wikipedia.org/wiki/Test",
      title: "Test",
      position: 1,
      sourceType: SourceType.Link,
      language: "en",
      articleId: "123",
      ...overrides,
    });

  beforeEach(async () => {
    db = new BreadcrumbsDB("test-visits-" + crypto.randomUUID());
    store = visitStore(db);
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it("add stores a visit and returns it", async () => {
    const visit = makeVisit();
    const result = await store.add(visit);
    expect(result.id).toBe(visit.id);

    const retrieved = await store.getById(visit.id);
    expect(retrieved?.title).toBe("Test");
  });

  it("getByTrailId returns visits sorted by position", async () => {
    const v1 = makeVisit({ position: 2, title: "Second" });
    const v2 = makeVisit({ position: 1, title: "First" });
    await store.add(v1);
    await store.add(v2);

    const results = await store.getByTrailId("trail-1");
    expect(results[0].title).toBe("First");
    expect(results[1].title).toBe("Second");
  });

  it("update modifies fields and sets updatedAt", async () => {
    const visit = makeVisit();
    await store.add(visit);

    const updated = await store.update(visit.id, { note: "Interesting" });
    expect(updated?.note).toBe("Interesting");
    expect(updated!.updatedAt).not.toBe(visit.updatedAt);
  });

  it("softDelete sets deletedAt and marks pending_sync", async () => {
    const visit = makeVisit();
    await store.add(visit);

    await store.softDelete(visit.id);
    const deleted = await store.getById(visit.id);
    expect(deleted?.deletedAt).not.toBeNull();
    expect(deleted?.syncStatus).toBe(SyncStatus.PendingSync);
  });

  it("getByTrailId excludes soft-deleted visits", async () => {
    const v1 = makeVisit({ position: 1 });
    const v2 = makeVisit({ position: 2 });
    await store.add(v1);
    await store.add(v2);
    await store.softDelete(v1.id);

    const results = await store.getByTrailId("trail-1");
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(v2.id);
  });

  it("getPendingSync returns only pending_sync visits", async () => {
    const v1 = makeVisit();
    await store.add(v1);
    await store.update(v1.id, { syncStatus: SyncStatus.PendingSync });

    const v2 = makeVisit({ position: 2 });
    await store.add(v2);

    const pending = await store.getPendingSync();
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe(v1.id);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/shared && pnpm test -- tests/db/visits.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement visit store**

```typescript
// packages/shared/src/db/visits.ts
import type { BreadcrumbsDB } from "./schema.js";
import type { Visit } from "../models/visit.js";
import { SyncStatus } from "../models/enums.js";

export function visitStore(db: BreadcrumbsDB) {
  return {
    async add(visit: Visit): Promise<Visit> {
      await db.visits.add(visit);
      return visit;
    },

    async getById(id: string): Promise<Visit | undefined> {
      return db.visits.get(id);
    },

    async getByTrailId(trailId: string): Promise<Visit[]> {
      return db.visits
        .where("trailId")
        .equals(trailId)
        .filter((v) => v.deletedAt === null)
        .sortBy("position");
    },

    async update(
      id: string,
      changes: Partial<Omit<Visit, "id">>
    ): Promise<Visit | undefined> {
      const updatedAt = new Date().toISOString();
      await db.visits.update(id, { ...changes, updatedAt });
      return db.visits.get(id);
    },

    async softDelete(id: string): Promise<void> {
      const now = new Date().toISOString();
      await db.visits.update(id, {
        deletedAt: now,
        updatedAt: now,
        syncStatus: SyncStatus.PendingSync,
      });
    },

    async getPendingSync(): Promise<Visit[]> {
      return db.visits
        .where("syncStatus")
        .equals(SyncStatus.PendingSync)
        .toArray();
    },
  };
}
```

- [ ] **Step 4: Update `packages/shared/src/db/index.ts`**

```typescript
// packages/shared/src/db/index.ts
export { BreadcrumbsDB } from "./schema.js";
export { visitStore } from "./visits.js";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/shared && pnpm test -- tests/db/visits.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/db/ packages/shared/tests/db/visits.test.ts
git commit -m "feat(shared): add visit CRUD operations"
```

---

### Task 10: Trail CRUD Operations

**Files:**
- Create: `packages/shared/src/db/trails.ts`
- Modify: `packages/shared/src/db/index.ts`
- Test: `packages/shared/tests/db/trails.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// packages/shared/tests/db/trails.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { BreadcrumbsDB } from "../../src/db/schema.js";
import { trailStore } from "../../src/db/trails.js";
import { createTrail } from "../../src/models/trail.js";
import { StartReason, TrailStatus, SyncStatus } from "../../src/models/enums.js";

describe("trailStore", () => {
  let db: BreadcrumbsDB;
  let store: ReturnType<typeof trailStore>;

  const makeTrail = (overrides: Record<string, unknown> = {}) =>
    createTrail({
      startReason: StartReason.AutoNewTab,
      deviceId: "device-1",
      ...overrides,
    });

  beforeEach(async () => {
    db = new BreadcrumbsDB("test-trails-" + crypto.randomUUID());
    store = trailStore(db);
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it("add stores a trail and returns it", async () => {
    const trail = makeTrail();
    const result = await store.add(trail);
    expect(result.id).toBe(trail.id);

    const retrieved = await store.getById(trail.id);
    expect(retrieved?.startReason).toBe(StartReason.AutoNewTab);
  });

  it("getActive returns only active, non-deleted trails", async () => {
    const active = makeTrail();
    const finalized = makeTrail();
    finalized.status = TrailStatus.Finalized;

    await store.add(active);
    await store.add(finalized);

    const results = await store.getActive();
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(active.id);
  });

  it("finalize sets status and endedAt", async () => {
    const trail = makeTrail();
    await store.add(trail);

    const result = await store.finalize(trail.id);
    expect(result?.status).toBe(TrailStatus.Finalized);
    expect(result?.endedAt).not.toBeNull();
  });

  it("update modifies fields", async () => {
    const trail = makeTrail();
    await store.add(trail);

    const result = await store.update(trail.id, {
      name: "My Trail",
      isStarred: true,
    });
    expect(result?.name).toBe("My Trail");
    expect(result?.isStarred).toBe(true);
  });

  it("softDelete sets deletedAt", async () => {
    const trail = makeTrail();
    await store.add(trail);
    await store.softDelete(trail.id);

    const deleted = await store.getById(trail.id);
    expect(deleted?.deletedAt).not.toBeNull();
    expect(deleted?.syncStatus).toBe(SyncStatus.PendingSync);
  });

  it("getAll excludes soft-deleted trails", async () => {
    const t1 = makeTrail();
    const t2 = makeTrail();
    await store.add(t1);
    await store.add(t2);
    await store.softDelete(t1.id);

    const results = await store.getAll();
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(t2.id);
  });

  it("getByDeviceId returns trails for a specific device", async () => {
    const t1 = makeTrail({ deviceId: "device-1" });
    const t2 = makeTrail({ deviceId: "device-2" });
    await store.add(t1);
    await store.add(t2);

    const results = await store.getByDeviceId("device-1");
    expect(results).toHaveLength(1);
    expect(results[0].deviceId).toBe("device-1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/shared && pnpm test -- tests/db/trails.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement trail store**

```typescript
// packages/shared/src/db/trails.ts
import type { BreadcrumbsDB } from "./schema.js";
import type { Trail } from "../models/trail.js";
import { TrailStatus, SyncStatus } from "../models/enums.js";

export function trailStore(db: BreadcrumbsDB) {
  return {
    async add(trail: Trail): Promise<Trail> {
      await db.trails.add(trail);
      return trail;
    },

    async getById(id: string): Promise<Trail | undefined> {
      return db.trails.get(id);
    },

    async getAll(): Promise<Trail[]> {
      const trails = await db.trails
        .filter((t) => t.deletedAt === null)
        .sortBy("startedAt");
      return trails.reverse();
    },

    async getActive(): Promise<Trail[]> {
      return db.trails
        .where("status")
        .equals(TrailStatus.Active)
        .filter((t) => t.deletedAt === null)
        .toArray();
    },

    async getByDeviceId(deviceId: string): Promise<Trail[]> {
      return db.trails
        .where("deviceId")
        .equals(deviceId)
        .filter((t) => t.deletedAt === null)
        .toArray();
    },

    async update(
      id: string,
      changes: Partial<Omit<Trail, "id">>
    ): Promise<Trail | undefined> {
      const updatedAt = new Date().toISOString();
      await db.trails.update(id, { ...changes, updatedAt });
      return db.trails.get(id);
    },

    async finalize(id: string): Promise<Trail | undefined> {
      const now = new Date().toISOString();
      await db.trails.update(id, {
        status: TrailStatus.Finalized,
        endedAt: now,
        updatedAt: now,
        syncStatus: SyncStatus.PendingSync,
      });
      return db.trails.get(id);
    },

    async softDelete(id: string): Promise<void> {
      const now = new Date().toISOString();
      await db.trails.update(id, {
        deletedAt: now,
        updatedAt: now,
        syncStatus: SyncStatus.PendingSync,
      });
    },

    async getPendingSync(): Promise<Trail[]> {
      return db.trails
        .where("syncStatus")
        .equals(SyncStatus.PendingSync)
        .toArray();
    },
  };
}
```

- [ ] **Step 4: Update `packages/shared/src/db/index.ts`**

```typescript
// packages/shared/src/db/index.ts
export { BreadcrumbsDB } from "./schema.js";
export { visitStore } from "./visits.js";
export { trailStore } from "./trails.js";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/shared && pnpm test -- tests/db/trails.test.ts`
Expected: PASS

- [ ] **Step 6: Run all tests**

Run: `cd packages/shared && pnpm test`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/db/ packages/shared/tests/db/trails.test.ts
git commit -m "feat(shared): add trail CRUD operations"
```

---

## Chunk 3: Trail Logic + Citation System

### Task 11: Trail Detection Logic

**Files:**
- Create: `packages/shared/src/trail/detection.ts`
- Create: `packages/shared/src/trail/index.ts`
- Test: `packages/shared/tests/trail/detection.test.ts`

The trail detection module decides whether a new Wikipedia navigation should continue an existing trail or start a new one. It is a pure function — no DB access, no side effects. The caller (extension background script or PWA) provides the context.

- [ ] **Step 1: Write the test**

```typescript
// packages/shared/tests/trail/detection.test.ts
import { describe, it, expect } from "vitest";
import {
  shouldStartNewTrail,
  type TrailDetectionContext,
} from "../../src/trail/detection.js";
import { StartReason } from "../../src/models/enums.js";

const baseContext: TrailDetectionContext = {
  currentTrailTabId: 1,
  currentTrailWindowId: 1,
  newTabId: 1,
  newWindowId: 1,
  isNewTab: false,
  transitionType: "link",
  referrerUrl: "https://en.wikipedia.org/wiki/Foo",
  newUrl: "https://en.wikipedia.org/wiki/Bar",
  msSinceLastVisit: 1000,
  idleTimeoutMs: 30 * 60 * 1000,
  isMainPage: false,
  isFromSearch: false,
};

function ctx(overrides: Partial<TrailDetectionContext>): TrailDetectionContext {
  return { ...baseContext, ...overrides };
}

describe("shouldStartNewTrail", () => {
  it("continues trail for normal link navigation in same tab", () => {
    const result = shouldStartNewTrail(baseContext);
    expect(result).toEqual({ isNew: false });
  });

  it("starts new trail for a new tab", () => {
    const result = shouldStartNewTrail(ctx({ isNewTab: true }));
    expect(result).toEqual({ isNew: true, reason: StartReason.AutoNewTab });
  });

  it("starts new trail after idle timeout", () => {
    const result = shouldStartNewTrail(
      ctx({ msSinceLastVisit: 31 * 60 * 1000 })
    );
    expect(result).toEqual({ isNew: true, reason: StartReason.AutoTimeout });
  });

  it("does not start new trail just before timeout", () => {
    const result = shouldStartNewTrail(
      ctx({ msSinceLastVisit: 29 * 60 * 1000 })
    );
    expect(result).toEqual({ isNew: false });
  });

  it("starts new trail for external referrer", () => {
    const result = shouldStartNewTrail(
      ctx({ referrerUrl: "https://google.com/search?q=test", transitionType: "typed" })
    );
    expect(result).toEqual({ isNew: true, reason: StartReason.AutoExternal });
  });

  it("starts new trail for Wikipedia search result", () => {
    const result = shouldStartNewTrail(ctx({ isFromSearch: true }));
    expect(result).toEqual({ isNew: true, reason: StartReason.AutoSearch });
  });

  it("starts new trail for Main Page visit", () => {
    const result = shouldStartNewTrail(ctx({ isMainPage: true }));
    expect(result).toEqual({ isNew: true, reason: StartReason.AutoMainPage });
  });

  it("starts new trail when no current trail exists (null tab)", () => {
    const result = shouldStartNewTrail(
      ctx({ currentTrailTabId: null, currentTrailWindowId: null })
    );
    expect(result).toEqual({ isNew: true, reason: StartReason.AutoNewTab });
  });

  it("starts new trail when tab differs from current trail", () => {
    const result = shouldStartNewTrail(ctx({ newTabId: 99 }));
    expect(result).toEqual({ isNew: true, reason: StartReason.AutoNewTab });
  });

  it("respects custom idle timeout", () => {
    const result = shouldStartNewTrail(
      ctx({ msSinceLastVisit: 11 * 60 * 1000, idleTimeoutMs: 10 * 60 * 1000 })
    );
    expect(result).toEqual({ isNew: true, reason: StartReason.AutoTimeout });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/shared && pnpm test -- tests/trail/detection.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement trail detection**

```typescript
// packages/shared/src/trail/detection.ts
import { StartReason } from "../models/enums.js";

export interface TrailDetectionContext {
  currentTrailTabId: number | null;
  currentTrailWindowId: number | null;
  newTabId: number;
  newWindowId: number;
  isNewTab: boolean;
  transitionType: string;
  referrerUrl: string | null;
  newUrl: string;
  msSinceLastVisit: number;
  idleTimeoutMs: number;
  isMainPage: boolean;
  isFromSearch: boolean;
}

type DetectionResult =
  | { isNew: false }
  | { isNew: true; reason: StartReason };

function isExternalReferrer(referrerUrl: string | null): boolean {
  if (!referrerUrl) return false;
  try {
    const url = new URL(referrerUrl);
    return !url.hostname.endsWith("wikipedia.org");
  } catch {
    return false;
  }
}

// Note: `manual` and `forked` start reasons are not returned by this function.
// They are explicit user actions handled by the caller (extension UI / PWA).
export function shouldStartNewTrail(context: TrailDetectionContext): DetectionResult {
  // No current trail — must start new
  if (context.currentTrailTabId === null) {
    return { isNew: true, reason: StartReason.AutoNewTab };
  }

  // Different tab — new trail
  if (context.newTabId !== context.currentTrailTabId) {
    return { isNew: true, reason: StartReason.AutoNewTab };
  }

  // New tab (e.g., opened from link)
  if (context.isNewTab) {
    return { isNew: true, reason: StartReason.AutoNewTab };
  }

  // Idle timeout
  if (context.msSinceLastVisit >= context.idleTimeoutMs) {
    return { isNew: true, reason: StartReason.AutoTimeout };
  }

  // External referrer
  if (isExternalReferrer(context.referrerUrl) && context.transitionType !== "link") {
    return { isNew: true, reason: StartReason.AutoExternal };
  }

  // Wikipedia search
  if (context.isFromSearch) {
    return { isNew: true, reason: StartReason.AutoSearch };
  }

  // Main page
  if (context.isMainPage) {
    return { isNew: true, reason: StartReason.AutoMainPage };
  }

  return { isNew: false };
}
```

- [ ] **Step 4: Create trail index**

```typescript
// packages/shared/src/trail/index.ts
export { shouldStartNewTrail } from "./detection.js";
export type { TrailDetectionContext } from "./detection.js";
```

- [ ] **Step 5: Update `packages/shared/src/index.ts`**

Add to the end:
```typescript
export * from "./trail/index.js";
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd packages/shared && pnpm test -- tests/trail/detection.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/trail/ packages/shared/tests/trail/ packages/shared/src/index.ts
git commit -m "feat(shared): add trail detection logic"
```

---

### Task 12: Trail Split Operation

**Files:**
- Create: `packages/shared/src/trail/operations.ts`
- Modify: `packages/shared/src/trail/index.ts`
- Test: `packages/shared/tests/trail/operations.test.ts`

Split and merge are DB-backed operations that require a transaction. They take the database instance and operate on it directly.

- [ ] **Step 1: Write the split test**

```typescript
// packages/shared/tests/trail/operations.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { BreadcrumbsDB } from "../../src/db/schema.js";
import { splitTrail, mergeTrails } from "../../src/trail/operations.js";
import { createTrail } from "../../src/models/trail.js";
import { createVisit } from "../../src/models/visit.js";
import { StartReason, SourceType, SyncStatus } from "../../src/models/enums.js";

describe("splitTrail", () => {
  let db: BreadcrumbsDB;

  beforeEach(async () => {
    db = new BreadcrumbsDB("test-ops-" + crypto.randomUUID());
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it("splits a trail at the given position", async () => {
    const trail = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    await db.trails.add(trail);

    const visits = [1, 2, 3, 4].map((pos) =>
      createVisit({
        trailId: trail.id,
        url: `https://en.wikipedia.org/wiki/Page${pos}`,
        title: `Page ${pos}`,
        position: pos,
        sourceType: SourceType.Link,
        language: "en",
        articleId: String(pos),
      })
    );
    await db.visits.bulkAdd(visits);

    const [originalId, newId] = await splitTrail(db, trail.id, 2);

    const originalVisits = await db.visits
      .where("trailId").equals(originalId)
      .sortBy("position");
    const newVisits = await db.visits
      .where("trailId").equals(newId)
      .sortBy("position");

    expect(originalVisits).toHaveLength(2);
    expect(originalVisits[0].title).toBe("Page 1");
    expect(originalVisits[1].title).toBe("Page 2");
    expect(originalVisits[0].position).toBe(1);
    expect(originalVisits[1].position).toBe(2);

    expect(newVisits).toHaveLength(2);
    expect(newVisits[0].title).toBe("Page 3");
    expect(newVisits[1].title).toBe("Page 4");
    expect(newVisits[0].position).toBe(1);
    expect(newVisits[1].position).toBe(2);
  });

  it("marks moved visits as pending_sync", async () => {
    const trail = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    await db.trails.add(trail);

    const visits = [1, 2, 3].map((pos) =>
      createVisit({
        trailId: trail.id,
        url: `https://en.wikipedia.org/wiki/P${pos}`,
        title: `P${pos}`,
        position: pos,
        sourceType: SourceType.Link,
        language: "en",
        articleId: String(pos),
      })
    );
    await db.visits.bulkAdd(visits);

    const [, newId] = await splitTrail(db, trail.id, 1);

    const newVisits = await db.visits
      .where("trailId").equals(newId)
      .toArray();
    for (const v of newVisits) {
      expect(v.syncStatus).toBe(SyncStatus.PendingSync);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/shared && pnpm test -- tests/trail/operations.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement splitTrail**

```typescript
// packages/shared/src/trail/operations.ts
import type { BreadcrumbsDB } from "../db/schema.js";
import { createTrail } from "../models/trail.js";
import { StartReason, SyncStatus } from "../models/enums.js";

export async function splitTrail(
  db: BreadcrumbsDB,
  trailId: string,
  atPosition: number
): Promise<[originalId: string, newId: string]> {
  return db.transaction("rw", db.trails, db.visits, async () => {
    const trail = await db.trails.get(trailId);
    if (!trail) throw new Error(`Trail not found: ${trailId}`);

    const allVisits = await db.visits
      .where("trailId")
      .equals(trailId)
      .filter((v) => v.deletedAt === null)
      .sortBy("position");

    const keep = allVisits.filter((v) => v.position <= atPosition);
    const move = allVisits.filter((v) => v.position > atPosition);

    if (move.length === 0) {
      throw new Error("Nothing to split: no visits after the split point");
    }

    const newTrail = createTrail({
      startReason: StartReason.Manual,
      deviceId: trail.deviceId,
      userId: trail.userId,
      tags: [...trail.tags],
    });
    await db.trails.add(newTrail);

    const now = new Date().toISOString();
    for (let i = 0; i < move.length; i++) {
      await db.visits.update(move[i].id, {
        trailId: newTrail.id,
        position: i + 1,
        syncStatus: SyncStatus.PendingSync,
        updatedAt: now,
      });
    }

    await db.trails.update(trailId, {
      updatedAt: now,
      syncStatus: SyncStatus.PendingSync,
    });

    return [trailId, newTrail.id];
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/shared && pnpm test -- tests/trail/operations.test.ts`
Expected: PASS

- [ ] **Step 5: Update `packages/shared/src/trail/index.ts` to export splitTrail**

```typescript
// packages/shared/src/trail/index.ts
export { shouldStartNewTrail } from "./detection.js";
export type { TrailDetectionContext } from "./detection.js";
export { splitTrail } from "./operations.js";
```

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/trail/ packages/shared/tests/trail/operations.test.ts
git commit -m "feat(shared): add trail split operation"
```

---

### Task 13: Trail Merge Operation

**Files:**
- Modify: `packages/shared/src/trail/operations.ts`
- Modify: `packages/shared/src/trail/index.ts`
- Modify: `packages/shared/tests/trail/operations.test.ts`

- [ ] **Step 1: Add merge tests to the operations test file**

Append to `packages/shared/tests/trail/operations.test.ts`:

```typescript
describe("mergeTrails", () => {
  let db: BreadcrumbsDB;

  beforeEach(async () => {
    db = new BreadcrumbsDB("test-merge-" + crypto.randomUUID());
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it("merges two trails by interleaving visits by timestamp", async () => {
    const t1 = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    const t2 = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    await db.trails.bulkAdd([t1, t2]);

    const v1 = createVisit({
      trailId: t1.id, url: "https://en.wikipedia.org/wiki/A", title: "A",
      position: 1, sourceType: SourceType.Link, language: "en", articleId: "1",
    });
    // Override timestamps for deterministic ordering
    (v1 as any).timestamp = "2026-01-01T00:00:00Z";

    const v2 = createVisit({
      trailId: t2.id, url: "https://en.wikipedia.org/wiki/B", title: "B",
      position: 1, sourceType: SourceType.Link, language: "en", articleId: "2",
    });
    (v2 as any).timestamp = "2026-01-01T00:01:00Z";

    const v3 = createVisit({
      trailId: t1.id, url: "https://en.wikipedia.org/wiki/C", title: "C",
      position: 2, sourceType: SourceType.Link, language: "en", articleId: "3",
    });
    (v3 as any).timestamp = "2026-01-01T00:02:00Z";

    await db.visits.bulkAdd([v1, v2, v3]);

    const mergedId = await mergeTrails(db, t1.id, t2.id);
    expect(mergedId).toBe(t1.id);

    const visits = await db.visits
      .where("trailId").equals(mergedId)
      .sortBy("position");
    expect(visits).toHaveLength(3);
    expect(visits[0].title).toBe("A");
    expect(visits[0].position).toBe(1);
    expect(visits[1].title).toBe("B");
    expect(visits[1].position).toBe(2);
    expect(visits[2].title).toBe("C");
    expect(visits[2].position).toBe(3);
  });

  it("soft-deletes the secondary trail", async () => {
    const t1 = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    const t2 = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    await db.trails.bulkAdd([t1, t2]);

    await mergeTrails(db, t1.id, t2.id);

    const secondary = await db.trails.get(t2.id);
    expect(secondary?.deletedAt).not.toBeNull();
  });

  it("marks all affected visits as pending_sync", async () => {
    const t1 = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    const t2 = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    await db.trails.bulkAdd([t1, t2]);

    const v1 = createVisit({
      trailId: t2.id, url: "https://en.wikipedia.org/wiki/X", title: "X",
      position: 1, sourceType: SourceType.Link, language: "en", articleId: "10",
    });
    await db.visits.add(v1);

    await mergeTrails(db, t1.id, t2.id);

    const visit = await db.visits.get(v1.id);
    expect(visit?.trailId).toBe(t1.id);
    expect(visit?.syncStatus).toBe(SyncStatus.PendingSync);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/shared && pnpm test -- tests/trail/operations.test.ts`
Expected: FAIL — `mergeTrails` not found

- [ ] **Step 3: Implement mergeTrails**

Add to `packages/shared/src/trail/operations.ts`:

```typescript
export async function mergeTrails(
  db: BreadcrumbsDB,
  primaryId: string,
  secondaryId: string
): Promise<string> {
  return db.transaction("rw", db.trails, db.visits, async () => {
    const primary = await db.trails.get(primaryId);
    const secondary = await db.trails.get(secondaryId);
    if (!primary) throw new Error(`Trail not found: ${primaryId}`);
    if (!secondary) throw new Error(`Trail not found: ${secondaryId}`);

    const primaryVisits = await db.visits
      .where("trailId").equals(primaryId)
      .filter((v) => v.deletedAt === null)
      .toArray();

    const secondaryVisits = await db.visits
      .where("trailId").equals(secondaryId)
      .filter((v) => v.deletedAt === null)
      .toArray();

    const allVisits = [...primaryVisits, ...secondaryVisits].sort(
      (a, b) => a.timestamp.localeCompare(b.timestamp)
    );

    const now = new Date().toISOString();
    for (let i = 0; i < allVisits.length; i++) {
      await db.visits.update(allVisits[i].id, {
        trailId: primaryId,
        position: i + 1,
        syncStatus: SyncStatus.PendingSync,
        updatedAt: now,
      });
    }

    // Soft-delete the secondary trail
    await db.trails.update(secondaryId, {
      deletedAt: now,
      updatedAt: now,
      syncStatus: SyncStatus.PendingSync,
    });

    // Update primary trail timestamps
    await db.trails.update(primaryId, {
      updatedAt: now,
      syncStatus: SyncStatus.PendingSync,
    });

    return primaryId;
  });
}
```

- [ ] **Step 4: Update `packages/shared/src/trail/index.ts`**

```typescript
// packages/shared/src/trail/index.ts
export { shouldStartNewTrail } from "./detection.js";
export type { TrailDetectionContext } from "./detection.js";
export { splitTrail, mergeTrails } from "./operations.js";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/shared && pnpm test -- tests/trail/operations.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/trail/ packages/shared/tests/trail/operations.test.ts
git commit -m "feat(shared): add trail merge operation"
```

---

### Task 14: Citation Formatters

**Files:**
- Create: `packages/shared/src/citation/formatters.ts`
- Create: `packages/shared/src/citation/index.ts`
- Test: `packages/shared/tests/citation/formatters.test.ts`

Citations are generated from Visit fields. Each formatter is a pure function.

- [ ] **Step 1: Write the test**

```typescript
// packages/shared/tests/citation/formatters.test.ts
import { describe, it, expect } from "vitest";
import { formatCitation } from "../../src/citation/formatters.js";
import { CitationFormat } from "../../src/models/enums.js";
import type { Visit } from "../../src/models/visit.js";

const visit: Pick<Visit, "url" | "title" | "timestamp" | "language" | "articleId"> = {
  url: "https://en.wikipedia.org/wiki/Rust_(programming_language)",
  title: "Rust (programming language)",
  timestamp: "2026-03-15T10:30:00.000Z",
  language: "en",
  articleId: "46765424",
};

describe("formatCitation", () => {
  it("formats Wikipedia citation template", () => {
    const result = formatCitation(visit, CitationFormat.Wikipedia);
    expect(result).toBe(
      '{{cite web |url=https://en.wikipedia.org/wiki/Rust_(programming_language) |title=Rust (programming language) |website=Wikipedia |language=en |access-date=2026-03-15}}'
    );
  });

  it("formats APA", () => {
    const result = formatCitation(visit, CitationFormat.APA);
    expect(result).toBe(
      "Rust (programming language). (2026, March 15). In *Wikipedia*. https://en.wikipedia.org/wiki/Rust_(programming_language)"
    );
  });

  it("formats MLA", () => {
    const result = formatCitation(visit, CitationFormat.MLA);
    expect(result).toBe(
      '"Rust (programming language)." *Wikipedia*, Wikimedia Foundation, 15 Mar. 2026, en.wikipedia.org/wiki/Rust_(programming_language).'
    );
  });

  it("formats Chicago", () => {
    const result = formatCitation(visit, CitationFormat.Chicago);
    expect(result).toBe(
      '"Rust (programming language)," Wikipedia, accessed March 15, 2026, https://en.wikipedia.org/wiki/Rust_(programming_language).'
    );
  });

  it("formats BibTeX", () => {
    const result = formatCitation(visit, CitationFormat.BibTeX);
    expect(result).toContain("@misc{wiki:46765424");
    expect(result).toContain("title = {Rust (programming language)}");
    expect(result).toContain("url = {https://en.wikipedia.org/wiki/Rust_(programming_language)}");
  });

  it("formats plain URL", () => {
    const result = formatCitation(visit, CitationFormat.URL);
    expect(result).toBe("https://en.wikipedia.org/wiki/Rust_(programming_language)");
  });

  it("formats Markdown link", () => {
    const result = formatCitation(visit, CitationFormat.Markdown);
    expect(result).toBe(
      "[Rust (programming language)](https://en.wikipedia.org/wiki/Rust_(programming_language))"
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/shared && pnpm test -- tests/citation/formatters.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement citation formatters**

```typescript
// packages/shared/src/citation/formatters.ts
import { CitationFormat } from "../models/enums.js";

interface CitationInput {
  url: string;
  title: string;
  timestamp: string;
  language: string;
  articleId: string;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const MLA_MONTHS = [
  "Jan.", "Feb.", "Mar.", "Apr.", "May", "June",
  "July", "Aug.", "Sept.", "Oct.", "Nov.", "Dec.",
];

function parseDate(timestamp: string) {
  const d = new Date(timestamp);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate() };
}

function formatISO(timestamp: string): string {
  const { year, month, day } = parseDate(timestamp);
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function urlWithoutProtocol(url: string): string {
  return url.replace(/^https?:\/\//, "");
}

export function formatCitation(input: CitationInput, format: CitationFormat): string {
  const { url, title, timestamp, language, articleId } = input;
  const { year, month, day } = parseDate(timestamp);

  switch (format) {
    case CitationFormat.Wikipedia:
      return `{{cite web |url=${url} |title=${title} |website=Wikipedia |language=${language} |access-date=${formatISO(timestamp)}}}`;

    case CitationFormat.APA:
      return `${title}. (${year}, ${MONTHS[month]} ${day}). In *Wikipedia*. ${url}`;

    case CitationFormat.MLA:
      return `"${title}." *Wikipedia*, Wikimedia Foundation, ${day} ${MLA_MONTHS[month]} ${year}, ${urlWithoutProtocol(url)}.`;

    case CitationFormat.Chicago:
      return `"${title}," Wikipedia, accessed ${MONTHS[month]} ${day}, ${year}, ${url}.`;

    case CitationFormat.BibTeX:
      return [
        `@misc{wiki:${articleId},`,
        `  title = {${title}},`,
        `  url = {${url}},`,
        `  journal = {Wikipedia},`,
        `  language = {${language}},`,
        `  year = {${year}},`,
        `  note = {Accessed ${formatISO(timestamp)}}`,
        `}`,
      ].join("\n");

    case CitationFormat.URL:
      return url;

    case CitationFormat.Markdown:
      return `[${title}](${url})`;

    default: {
      const _exhaustive: never = format;
      throw new Error(`Unknown format: ${_exhaustive}`);
    }
  }
}
```

- [ ] **Step 4: Create citation index**

```typescript
// packages/shared/src/citation/index.ts
export { formatCitation } from "./formatters.js";
```

- [ ] **Step 5: Update `packages/shared/src/index.ts`**

Add to the end:
```typescript
export * from "./citation/index.js";
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd packages/shared && pnpm test -- tests/citation/formatters.test.ts`
Expected: PASS

- [ ] **Step 7: Run all tests**

Run: `cd packages/shared && pnpm test`
Expected: All tests pass

- [ ] **Step 8: Verify build**

Run: `cd packages/shared && pnpm build`
Expected: `dist/index.js` created with all exports

- [ ] **Step 9: Commit**

```bash
git add packages/shared/src/citation/ packages/shared/tests/citation/ packages/shared/src/index.ts
git commit -m "feat(shared): add citation formatters (Wikipedia, APA, MLA, Chicago, BibTeX, URL, Markdown)"
```

---

## Summary

This plan covers the full `packages/shared` library minus the sync layer (Supabase integration), which will be a separate plan.

**What this produces:**
- Working pnpm monorepo scaffold
- Complete TypeScript data model (Visit, Trail, User, ConflictLog, all enums)
- Wikipedia URL parsing and validation
- IndexedDB persistence via Dexie.js (Visit + Trail CRUD, soft delete)
- Trail detection heuristics (new tab, timeout, external referrer, search, Main Page)
- Trail split and merge operations
- Citation formatting in 7 formats

**Next plans needed:**
1. **Sync layer** — Supabase client, push/pull, conflict resolution
2. **Chrome extension** — service worker, content script, popup/history/options UI
3. **PWA** — SvelteKit routes, components, service worker, share target
