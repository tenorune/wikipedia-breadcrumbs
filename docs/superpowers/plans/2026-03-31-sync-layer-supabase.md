# Sync Layer + Supabase Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add bidirectional sync between local IndexedDB and Supabase, with anonymous auth and extension integration.

**Architecture:** A `SyncBackend` interface abstracts remote storage. The Supabase implementation handles field mapping (camelCase↔snake_case), auth, and upserts. A `SyncEngine` orchestrates push/pull cycles using the backend and local DB stores. The extension triggers sync from the offscreen document via alarms and manual button.

**Tech Stack:** TypeScript, Supabase JS (`@supabase/supabase-js`), Dexie.js, Vitest

**Spec reference:** `docs/superpowers/specs/2026-03-31-sync-layer-supabase-design.md`

**Prerequisite:** Supabase project set up per `docs/setup/supabase-setup.md` with `.env` file containing `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

---

## Chunk 1: Shared Lib Model Changes + Sync Interfaces

### Task 1: Update ConflictLog Model

**Files:**
- Modify: `packages/shared/src/models/conflict-log.ts`
- Modify: `packages/shared/tests/models/index.test.ts`

- [ ] **Step 1: Add `userId` to ConflictLog interface**

```typescript
// packages/shared/src/models/conflict-log.ts
export interface ConflictLog {
  id: string;
  userId: string;
  recordType: "visit" | "trail";
  recordId: string;
  losingSnapshot: Record<string, unknown>;
  winningSnapshot: Record<string, unknown>;
  resolvedAt: string | null;
  createdAt: string;
}
```

- [ ] **Step 2: Run tests to verify nothing breaks**

Run: `cd packages/shared && node_modules/.bin/vitest run`
Expected: All tests pass (ConflictLog is a type-only export, no runtime tests depend on it)

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/models/conflict-log.ts
git commit -m "feat(shared): add userId to ConflictLog interface for sync"
```

---

### Task 2: Add `@supabase/supabase-js` Dependency

**Files:**
- Modify: `packages/shared/package.json`

- [ ] **Step 1: Add dependency**

```bash
cd packages/shared && pnpm add @supabase/supabase-js
```

- [ ] **Step 2: Verify install**

Run: `pnpm install` from repo root
Expected: Resolves without errors

- [ ] **Step 3: Commit**

```bash
git add packages/shared/package.json pnpm-lock.yaml
git commit -m "chore(shared): add @supabase/supabase-js dependency"
```

---

### Task 3: Field Mapper (camelCase ↔ snake_case)

**Files:**
- Create: `packages/shared/src/sync/field-mapper.ts`
- Test: `packages/shared/tests/sync/field-mapper.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// packages/shared/tests/sync/field-mapper.test.ts
import { describe, it, expect } from "vitest";
import { toSnakeCase, toCamelCase, mapToRemote, mapToLocal } from "../../src/sync/field-mapper.js";

describe("field-mapper", () => {
  it("toSnakeCase converts camelCase keys", () => {
    expect(toSnakeCase("trailId")).toBe("trail_id");
    expect(toSnakeCase("lastVisitedAt")).toBe("last_visited_at");
    expect(toSnakeCase("isStarred")).toBe("is_starred");
    expect(toSnakeCase("url")).toBe("url");
    expect(toSnakeCase("thumbnailUrl")).toBe("thumbnail_url");
  });

  it("toCamelCase converts snake_case keys", () => {
    expect(toCamelCase("trail_id")).toBe("trailId");
    expect(toCamelCase("last_visited_at")).toBe("lastVisitedAt");
    expect(toCamelCase("is_starred")).toBe("isStarred");
    expect(toCamelCase("url")).toBe("url");
  });

  it("mapToRemote converts object keys to snake_case and strips syncStatus", () => {
    const local = {
      id: "abc",
      trailId: "t1",
      lastVisitedAt: "2026-01-01",
      syncStatus: "pending_sync",
    };
    const remote = mapToRemote(local);
    expect(remote).toEqual({
      id: "abc",
      trail_id: "t1",
      last_visited_at: "2026-01-01",
    });
    expect(remote).not.toHaveProperty("sync_status");
    expect(remote).not.toHaveProperty("syncStatus");
  });

  it("mapToLocal converts object keys to camelCase", () => {
    const remote = {
      id: "abc",
      trail_id: "t1",
      last_visited_at: "2026-01-01",
    };
    const local = mapToLocal(remote);
    expect(local).toEqual({
      id: "abc",
      trailId: "t1",
      lastVisitedAt: "2026-01-01",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/shared && node_modules/.bin/vitest run tests/sync/field-mapper.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement field mapper**

```typescript
// packages/shared/src/sync/field-mapper.ts

export function toSnakeCase(key: string): string {
  return key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
}

export function toCamelCase(key: string): string {
  return key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

const LOCAL_ONLY_FIELDS = new Set(["syncStatus"]);

export function mapToRemote(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (LOCAL_ONLY_FIELDS.has(key)) continue;
    result[toSnakeCase(key)] = value;
  }
  return result;
}

export function mapToLocal(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[toCamelCase(key)] = value;
  }
  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/shared && node_modules/.bin/vitest run tests/sync/field-mapper.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/sync/field-mapper.ts packages/shared/tests/sync/field-mapper.test.ts
git commit -m "feat(shared): add camelCase/snake_case field mapper for sync"
```

---

### Task 4: SyncBackend Interface + SyncEngine Interface

**Files:**
- Create: `packages/shared/src/sync/backend.ts`
- Create: `packages/shared/src/sync/types.ts`

- [ ] **Step 1: Create types**

```typescript
// packages/shared/src/sync/types.ts
export interface SyncResult {
  id: string;
  success: boolean;
  error?: string;
}

export interface SyncReport {
  pushed: { trails: number; visits: number; conflictLogs: number };
  pulled: { trails: number; visits: number };
  conflicts: number;
  errors: string[];
  startedAt: string;
  completedAt: string;
}

export interface SyncStateStore {
  getLastSyncTime(): Promise<string | null>;
  setLastSyncTime(time: string): Promise<void>;
}
```

- [ ] **Step 2: Create backend interface**

```typescript
// packages/shared/src/sync/backend.ts
import type { Trail, Visit, ConflictLog } from "../models/index.js";
import type { SyncResult } from "./types.js";

export interface SyncBackend {
  pushTrails(trails: Trail[]): Promise<SyncResult[]>;
  pushVisits(visits: Visit[]): Promise<SyncResult[]>;
  pushConflictLogs(logs: ConflictLog[]): Promise<SyncResult[]>;
  pullTrails(since: string): Promise<Trail[]>;
  pullVisits(since: string): Promise<Visit[]>;
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/sync/types.ts packages/shared/src/sync/backend.ts
git commit -m "feat(shared): add SyncBackend and SyncEngine interfaces"
```

---

### Task 5: Supabase Client Factory

**Files:**
- Create: `packages/shared/src/sync/supabase-client.ts`

- [ ] **Step 1: Implement**

```typescript
// packages/shared/src/sync/supabase-client.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function createSupabaseClient(
  url: string,
  anonKey: string
): SupabaseClient {
  return createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

export type { SupabaseClient } from "@supabase/supabase-js";
```

- [ ] **Step 2: Commit**

```bash
git add packages/shared/src/sync/supabase-client.ts
git commit -m "feat(shared): add Supabase client factory"
```

---

### Task 6: Create `.env.example`

**Files:**
- Create: `.env.example`
- Modify: `.gitignore`

- [ ] **Step 1: Create `.env.example`**

```
# Supabase credentials — get these from your Supabase project dashboard
# Settings → API → Project URL and anon/public key
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

- [ ] **Step 2: Add `.env` to gitignore (if not already)**

Verify `.gitignore` already has `.env` and `.env.local` entries (it should from initial setup).

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "chore: add .env.example with Supabase credential placeholders"
```

---

## Chunk 2: Supabase Backend + Sync Engine

### Task 7: Supabase Backend Implementation

**Files:**
- Create: `packages/shared/src/sync/supabase-backend.ts`
- Test: `packages/shared/tests/sync/supabase-backend.test.ts`

This implements `SyncBackend` using the Supabase JS client. Tests use a mock Supabase client.

- [ ] **Step 1: Write the test**

```typescript
// packages/shared/tests/sync/supabase-backend.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SupabaseBackend } from "../../src/sync/supabase-backend.js";
import { createTrail, createVisit, StartReason, SourceType, SyncStatus } from "../../src/models/index.js";

function mockSupabase() {
  const upsertFn = vi.fn().mockResolvedValue({ data: [], error: null });
  const selectFn = vi.fn().mockReturnValue({
    gt: vi.fn().mockResolvedValue({ data: [], error: null }),
  });
  const from = vi.fn().mockReturnValue({
    upsert: upsertFn,
    select: selectFn,
  });
  return { from, upsertFn, selectFn };
}

describe("SupabaseBackend", () => {
  let mock: ReturnType<typeof mockSupabase>;
  let backend: SupabaseBackend;

  beforeEach(() => {
    mock = mockSupabase();
    backend = new SupabaseBackend(mock as any, "user-123");
  });

  it("pushTrails upserts trails with snake_case fields", async () => {
    const trail = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    trail.userId = "user-123";

    const results = await backend.pushTrails([trail]);
    expect(mock.from).toHaveBeenCalledWith("trails");
    expect(mock.upsertFn).toHaveBeenCalled();

    const upsertArg = mock.upsertFn.mock.calls[0][0];
    expect(upsertArg[0]).toHaveProperty("start_reason", "auto_new_tab");
    expect(upsertArg[0]).not.toHaveProperty("syncStatus");
    expect(upsertArg[0]).not.toHaveProperty("sync_status");
    expect(results[0].success).toBe(true);
  });

  it("pushVisits upserts visits with snake_case and injects user_id", async () => {
    const visit = createVisit({
      trailId: "t1", url: "https://en.wikipedia.org/wiki/Test",
      title: "Test", position: 1, sourceType: SourceType.Link,
      language: "en", articleId: "Test",
    });

    const results = await backend.pushVisits([visit]);
    expect(mock.from).toHaveBeenCalledWith("visits");

    const upsertArg = mock.upsertFn.mock.calls[0][0];
    expect(upsertArg[0]).toHaveProperty("user_id", "user-123");
    expect(upsertArg[0]).toHaveProperty("trail_id", "t1");
    expect(results[0].success).toBe(true);
  });

  it("pullTrails returns trails mapped to camelCase with synced status", async () => {
    const remoteTrail = {
      id: "t1", user_id: "user-123", name: null,
      created_at: "2026-01-01", started_at: "2026-01-01",
      ended_at: null, status: "active", is_starred: false,
      tags: [], note: null, visibility: "private",
      device_id: "d1", forked_from_visit_id: null,
      start_reason: "auto_new_tab", updated_at: "2026-01-01",
      deleted_at: null,
    };
    mock.selectFn.mockReturnValue({
      gt: vi.fn().mockResolvedValue({ data: [remoteTrail], error: null }),
    });

    const trails = await backend.pullTrails("2025-01-01");
    expect(trails).toHaveLength(1);
    expect(trails[0]).toHaveProperty("userId", "user-123");
    expect(trails[0]).toHaveProperty("startReason", "auto_new_tab");
    expect(trails[0]).toHaveProperty("isStarred", false);
    expect(trails[0]).toHaveProperty("syncStatus", "synced");
  });

  it("handles upsert errors gracefully", async () => {
    mock.upsertFn.mockResolvedValue({
      data: null,
      error: { message: "RLS violation" },
    });

    const trail = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    const results = await backend.pushTrails([trail]);
    expect(results[0].success).toBe(false);
    expect(results[0].error).toContain("RLS violation");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/shared && node_modules/.bin/vitest run tests/sync/supabase-backend.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement Supabase backend**

```typescript
// packages/shared/src/sync/supabase-backend.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Trail, Visit, ConflictLog } from "../models/index.js";
import type { SyncBackend } from "./backend.js";
import type { SyncResult } from "./types.js";
import { mapToRemote, mapToLocal } from "./field-mapper.js";
import { SyncStatus } from "../models/enums.js";

export class SupabaseBackend implements SyncBackend {
  constructor(
    private client: SupabaseClient,
    private userId: string
  ) {}

  async pushTrails(trails: Trail[]): Promise<SyncResult[]> {
    return this.upsertAll("trails", trails.map((t) => mapToRemote(t as any)));
  }

  async pushVisits(visits: Visit[]): Promise<SyncResult[]> {
    return this.upsertAll(
      "visits",
      visits.map((v) => {
        const remote = mapToRemote(v as any);
        remote.user_id = this.userId;
        return remote;
      })
    );
  }

  async pushConflictLogs(logs: ConflictLog[]): Promise<SyncResult[]> {
    return this.upsertAll("conflict_logs", logs.map((l) => mapToRemote(l as any)));
  }

  async pullTrails(since: string): Promise<Trail[]> {
    return this.pullTable<Trail>("trails", since);
  }

  async pullVisits(since: string): Promise<Visit[]> {
    return this.pullTable<Visit>("visits", since);
  }

  private async upsertAll(
    table: string,
    records: Record<string, unknown>[]
  ): Promise<SyncResult[]> {
    const results: SyncResult[] = [];

    for (const record of records) {
      const { error } = await this.client.from(table).upsert(record);
      if (error) {
        results.push({ id: record.id as string, success: false, error: error.message });
      } else {
        results.push({ id: record.id as string, success: true });
      }
    }

    return results;
  }

  private async pullTable<T>(table: string, since: string): Promise<T[]> {
    const { data, error } = await this.client
      .from(table)
      .select()
      .gt("updated_at", since);

    if (error || !data) return [];

    return data.map((row: Record<string, unknown>) => {
      const local = mapToLocal(row);
      (local as any).syncStatus = SyncStatus.Synced;
      return local as T;
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/shared && node_modules/.bin/vitest run tests/sync/supabase-backend.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/sync/supabase-backend.ts packages/shared/tests/sync/supabase-backend.test.ts
git commit -m "feat(shared): implement Supabase sync backend with field mapping"
```

---

### Task 8: Sync Engine

**Files:**
- Create: `packages/shared/src/sync/engine.ts`
- Test: `packages/shared/tests/sync/engine.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// packages/shared/tests/sync/engine.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  BreadcrumbsDB, visitStore, trailStore,
  createTrail, createVisit,
  StartReason, SourceType, SyncStatus,
} from "../../src/models/index.js";
import { BreadcrumbsDB as DB } from "../../src/db/schema.js";
import { SyncEngine } from "../../src/sync/engine.js";
import type { SyncBackend } from "../../src/sync/backend.js";
import type { SyncStateStore } from "../../src/sync/types.js";

function mockBackend(): SyncBackend {
  return {
    pushTrails: vi.fn().mockResolvedValue([]),
    pushVisits: vi.fn().mockResolvedValue([]),
    pushConflictLogs: vi.fn().mockResolvedValue([]),
    pullTrails: vi.fn().mockResolvedValue([]),
    pullVisits: vi.fn().mockResolvedValue([]),
  };
}

function mockStateStore(): SyncStateStore {
  let lastSync: string | null = null;
  return {
    getLastSyncTime: vi.fn(async () => lastSync),
    setLastSyncTime: vi.fn(async (t: string) => { lastSync = t; }),
  };
}

describe("SyncEngine", () => {
  let db: DB;
  let backend: ReturnType<typeof mockBackend>;
  let stateStore: ReturnType<typeof mockStateStore>;
  let engine: SyncEngine;

  beforeEach(async () => {
    db = new DB("test-sync-" + crypto.randomUUID());
    await db.open();
    backend = mockBackend();
    stateStore = mockStateStore();
    engine = new SyncEngine(db, backend, stateStore, "user-123");
  });

  afterEach(async () => {
    await db.delete();
  });

  it("pushes pending_sync trails", async () => {
    const trail = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    trail.syncStatus = SyncStatus.PendingSync;
    trail.userId = "user-123";
    await db.trails.add(trail);

    (backend.pushTrails as any).mockResolvedValue([{ id: trail.id, success: true }]);

    const report = await engine.syncNow();
    expect(backend.pushTrails).toHaveBeenCalled();
    expect(report.pushed.trails).toBe(1);

    const updated = await db.trails.get(trail.id);
    expect(updated?.syncStatus).toBe(SyncStatus.Synced);
  });

  it("pushes local_only trails", async () => {
    const trail = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    trail.userId = "user-123";
    // local_only is the default
    await db.trails.add(trail);

    (backend.pushTrails as any).mockResolvedValue([{ id: trail.id, success: true }]);

    const report = await engine.syncNow();
    expect(report.pushed.trails).toBe(1);
  });

  it("pulls remote trails and inserts locally", async () => {
    const remoteTrail = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d2" });
    remoteTrail.userId = "user-123";
    remoteTrail.syncStatus = SyncStatus.Synced;

    (backend.pullTrails as any).mockResolvedValue([remoteTrail]);

    const report = await engine.syncNow();
    expect(report.pulled.trails).toBe(1);

    const local = await db.trails.get(remoteTrail.id);
    expect(local).toBeDefined();
    expect(local?.deviceId).toBe("d2");
  });

  it("overwrites local synced record with newer remote", async () => {
    const trail = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    trail.userId = "user-123";
    trail.syncStatus = SyncStatus.Synced;
    trail.name = "old name";
    trail.updatedAt = "2026-01-01T00:00:00Z";
    await db.trails.add(trail);

    const remoteTrail = { ...trail, name: "new name", updatedAt: "2026-02-01T00:00:00Z", syncStatus: SyncStatus.Synced };
    (backend.pullTrails as any).mockResolvedValue([remoteTrail]);

    await engine.syncNow();

    const local = await db.trails.get(trail.id);
    expect(local?.name).toBe("new name");
  });

  it("logs conflict when remote overwrites pending_sync local", async () => {
    const trail = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    trail.userId = "user-123";
    trail.syncStatus = SyncStatus.PendingSync;
    trail.name = "local edit";
    trail.updatedAt = "2026-01-01T00:00:00Z";
    await db.trails.add(trail);

    const remoteTrail = { ...trail, name: "remote edit", updatedAt: "2026-02-01T00:00:00Z", syncStatus: SyncStatus.Synced };
    (backend.pullTrails as any).mockResolvedValue([remoteTrail]);
    (backend.pushTrails as any).mockResolvedValue([]);

    await engine.syncNow();

    const conflicts = await db.conflictLogs.toArray();
    expect(conflicts).toHaveLength(1);
    expect((conflicts[0].losingSnapshot as any).name).toBe("local edit");
  });

  it("skips pull record when local is newer", async () => {
    const trail = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    trail.userId = "user-123";
    trail.syncStatus = SyncStatus.Synced;
    trail.name = "local newer";
    trail.updatedAt = "2026-03-01T00:00:00Z";
    await db.trails.add(trail);

    const remoteTrail = { ...trail, name: "remote older", updatedAt: "2026-01-01T00:00:00Z", syncStatus: SyncStatus.Synced };
    (backend.pullTrails as any).mockResolvedValue([remoteTrail]);

    await engine.syncNow();

    const local = await db.trails.get(trail.id);
    expect(local?.name).toBe("local newer");
  });

  it("updates lastSyncTime after successful sync", async () => {
    await engine.syncNow();
    expect(stateStore.setLastSyncTime).toHaveBeenCalled();
  });

  it("prevents concurrent syncs", async () => {
    let resolveFirst: () => void;
    const slowPush = new Promise<void>((r) => { resolveFirst = r; });
    (backend.pushTrails as any).mockImplementation(async () => {
      await slowPush;
      return [];
    });

    const first = engine.syncNow();
    const second = engine.syncNow();

    resolveFirst!();
    const [report1, report2] = await Promise.all([first, second]);

    // Second sync should have been skipped
    expect(report2.errors).toContain("Sync already in progress");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/shared && node_modules/.bin/vitest run tests/sync/engine.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement sync engine**

```typescript
// packages/shared/src/sync/engine.ts
import type { BreadcrumbsDB } from "../db/schema.js";
import { visitStore } from "../db/visits.js";
import { trailStore } from "../db/trails.js";
import type { Trail, Visit, ConflictLog } from "../models/index.js";
import { SyncStatus } from "../models/enums.js";
import type { SyncBackend } from "./backend.js";
import type { SyncReport, SyncStateStore } from "./types.js";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export class SyncEngine {
  private syncing = false;

  constructor(
    private db: BreadcrumbsDB,
    private backend: SyncBackend,
    private stateStore: SyncStateStore,
    private userId: string
  ) {}

  async syncNow(): Promise<SyncReport> {
    if (this.syncing) {
      return {
        pushed: { trails: 0, visits: 0, conflictLogs: 0 },
        pulled: { trails: 0, visits: 0 },
        conflicts: 0,
        errors: ["Sync already in progress"],
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };
    }

    this.syncing = true;
    const startedAt = new Date().toISOString();
    const report: SyncReport = {
      pushed: { trails: 0, visits: 0, conflictLogs: 0 },
      pulled: { trails: 0, visits: 0 },
      conflicts: 0,
      errors: [],
      startedAt,
      completedAt: "",
    };

    try {
      await this.push(report);
      await this.pull(report);
      await this.cleanupOldDeleted();
      await this.stateStore.setLastSyncTime(new Date().toISOString());
    } catch (err) {
      report.errors.push(String(err));
    } finally {
      report.completedAt = new Date().toISOString();
      this.syncing = false;
    }

    return report;
  }

  private async push(report: SyncReport): Promise<void> {
    const trails = trailStore(this.db);
    const visits = visitStore(this.db);

    // Push trails
    const pendingTrails = await this.getPushable(this.db.trails);
    if (pendingTrails.length > 0) {
      const results = await this.backend.pushTrails(pendingTrails);
      for (const result of results) {
        if (result.success) {
          await trails.update(result.id, { syncStatus: SyncStatus.Synced } as any);
          report.pushed.trails++;
        } else {
          report.errors.push(`Trail push failed ${result.id}: ${result.error}`);
        }
      }
    }

    // Push visits
    const pendingVisits = await this.getPushable(this.db.visits);
    if (pendingVisits.length > 0) {
      const results = await this.backend.pushVisits(pendingVisits);
      for (const result of results) {
        if (result.success) {
          await visits.update(result.id, { syncStatus: SyncStatus.Synced } as any);
          report.pushed.visits++;
        } else {
          report.errors.push(`Visit push failed ${result.id}: ${result.error}`);
        }
      }
    }

    // Push conflict logs
    const pendingConflicts = await this.db.conflictLogs
      .filter((c) => !c.resolvedAt)
      .toArray();
    if (pendingConflicts.length > 0) {
      const results = await this.backend.pushConflictLogs(pendingConflicts);
      report.pushed.conflictLogs = results.filter((r) => r.success).length;
    }
  }

  private async pull(report: SyncReport): Promise<void> {
    const trails = trailStore(this.db);
    const visits = visitStore(this.db);
    const lastSync = (await this.stateStore.getLastSyncTime()) ?? "1970-01-01T00:00:00Z";

    // Pull trails
    const remoteTrails = await this.backend.pullTrails(lastSync);
    for (const remote of remoteTrails) {
      await this.mergeRecord(remote, this.db.trails, trails, "trail", report);
      report.pulled.trails++;
    }

    // Pull visits
    const remoteVisits = await this.backend.pullVisits(lastSync);
    for (const remote of remoteVisits) {
      await this.mergeRecord(remote, this.db.visits, visits, "visit", report);
      report.pulled.visits++;
    }
  }

  private async mergeRecord<T extends { id: string; updatedAt: string; syncStatus: string }>(
    remote: T,
    table: { get(id: string): Promise<T | undefined> },
    store: { update(id: string, changes: any): Promise<any> },
    recordType: "trail" | "visit",
    report: SyncReport
  ): Promise<void> {
    const local = await table.get(remote.id);

    if (!local) {
      // New record from remote — insert directly
      await this.db.table(recordType === "trail" ? "trails" : "visits").add(remote);
      return;
    }

    if (local.updatedAt >= remote.updatedAt) {
      // Local is same or newer — skip
      return;
    }

    // Remote is newer
    if (local.syncStatus === SyncStatus.PendingSync || local.syncStatus === SyncStatus.LocalOnly) {
      // Conflict: local has unpushed changes
      const conflict: ConflictLog = {
        id: crypto.randomUUID(),
        userId: this.userId,
        recordType,
        recordId: remote.id,
        losingSnapshot: { ...local } as any,
        winningSnapshot: { ...remote } as any,
        resolvedAt: null,
        createdAt: new Date().toISOString(),
      };
      await this.db.conflictLogs.add(conflict);
      report.conflicts++;
    }

    // Overwrite local with remote
    const { id, ...changes } = remote as any;
    await store.update(remote.id, changes);
  }

  private async getPushable(table: any): Promise<any[]> {
    const pending = await table
      .where("syncStatus")
      .anyOf([SyncStatus.PendingSync, SyncStatus.LocalOnly])
      .toArray();
    return pending;
  }

  private async cleanupOldDeleted(): Promise<void> {
    const cutoff = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();

    const oldTrails = await this.db.trails
      .where("deletedAt")
      .below(cutoff)
      .toArray();
    for (const t of oldTrails) {
      if (t.deletedAt) await this.db.trails.delete(t.id);
    }

    const oldVisits = await this.db.visits
      .where("deletedAt")
      .below(cutoff)
      .toArray();
    for (const v of oldVisits) {
      if (v.deletedAt) await this.db.visits.delete(v.id);
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/shared && node_modules/.bin/vitest run tests/sync/engine.test.ts`
Expected: PASS

- [ ] **Step 5: Create sync index and update shared exports**

```typescript
// packages/shared/src/sync/index.ts
export { SyncEngine } from "./engine.js";
export { SupabaseBackend } from "./supabase-backend.js";
export { createSupabaseClient } from "./supabase-client.js";
export type { SyncBackend } from "./backend.js";
export type { SyncResult, SyncReport, SyncStateStore } from "./types.js";
export { mapToRemote, mapToLocal, toSnakeCase, toCamelCase } from "./field-mapper.js";
```

Add to `packages/shared/src/index.ts`:
```typescript
export * from "./sync/index.js";
```

- [ ] **Step 6: Run all shared tests**

Run: `cd packages/shared && node_modules/.bin/vitest run`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/sync/ packages/shared/tests/sync/engine.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): implement sync engine with push/pull/conflict detection"
```

---

## Chunk 3: Extension Integration

### Task 9: Update Extension Settings

**Files:**
- Modify: `packages/extension/src/shared/settings.ts`
- Modify: `packages/extension/tests/shared/settings.test.ts`

- [ ] **Step 1: Update settings interface**

```typescript
// packages/extension/src/shared/settings.ts
export interface ExtensionSettings {
  idleTimeoutMinutes: number;
  captureEnabled: boolean;
  syncEnabled: boolean;
}

export const DEFAULTS: ExtensionSettings = {
  idleTimeoutMinutes: 30,
  captureEnabled: true,
  syncEnabled: false,
};

const KEYS = Object.keys(DEFAULTS) as (keyof ExtensionSettings)[];

export async function getSettings(): Promise<ExtensionSettings> {
  const stored = await chrome.storage.local.get(KEYS);
  return { ...DEFAULTS, ...stored } as ExtensionSettings;
}

export async function updateSettings(changes: Partial<ExtensionSettings>): Promise<void> {
  await chrome.storage.local.set(changes);
}
```

- [ ] **Step 2: Update settings test**

Add to existing test:

```typescript
it("DEFAULTS includes syncEnabled as false", () => {
  expect(DEFAULTS.syncEnabled).toBe(false);
});
```

- [ ] **Step 3: Run tests**

Run: `cd packages/extension && node_modules/.bin/vitest run tests/shared/settings.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/extension/src/shared/settings.ts packages/extension/tests/shared/settings.test.ts
git commit -m "feat(extension): add syncEnabled setting"
```

---

### Task 10: Add Sync Messages to Offscreen Protocol

**Files:**
- Modify: `packages/extension/src/shared/messaging.ts`

- [ ] **Step 1: Add sync message types**

Add to `OffscreenRequest` union:

```typescript
  | { type: "enableSync" }
  | { type: "disableSync" }
  | { type: "syncNow" }
  | { type: "getSyncStatus" };
```

Also add to `BackgroundMessage` union:

```typescript
export type BackgroundMessage = PopupMessage | TrailMutationMessage
  | { type: "getSyncStatus" }
  | { type: "syncNow" }
  | { type: "enableSync" }
  | { type: "disableSync" };
```

- [ ] **Step 2: Commit**

```bash
git add packages/extension/src/shared/messaging.ts
git commit -m "feat(extension): add sync message types to offscreen protocol"
```

---

### Task 11: Offscreen Sync Handler

**Files:**
- Create: `packages/extension/src/offscreen/sync-handler.ts`
- Modify: `packages/extension/src/offscreen/index.ts`

The offscreen document manages the Supabase client, anonymous auth, and sync engine.

- [ ] **Step 1: Implement sync handler**

```typescript
// packages/extension/src/offscreen/sync-handler.ts
import {
  BreadcrumbsDB,
  SyncEngine,
  SupabaseBackend,
  createSupabaseClient,
  SyncStatus,
  trailStore,
} from "@wikipedia-breadcrumbs/shared";
import type { SyncReport, SyncStateStore } from "@wikipedia-breadcrumbs/shared";
import type { SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

let supabase: SupabaseClient | null = null;
let engine: SyncEngine | null = null;
let userId: string | null = null;
let lastReport: SyncReport | null = null;

const stateStore: SyncStateStore = {
  async getLastSyncTime() {
    const { lastSyncTime } = await chrome.storage.local.get("lastSyncTime");
    return (lastSyncTime as string) ?? null;
  },
  async setLastSyncTime(time: string) {
    await chrome.storage.local.set({ lastSyncTime: time });
  },
};

async function ensureInitialized(db: BreadcrumbsDB): Promise<boolean> {
  if (engine) return true;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error("[breadcrumbs] Missing Supabase env vars");
    return false;
  }

  supabase = createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Anonymous auth
  const { data: authData, error: authError } = await supabase.auth.signInAnonymously();
  if (authError || !authData.user) {
    console.error("[breadcrumbs] Anonymous auth failed:", authError);
    return false;
  }
  userId = authData.user.id;

  // Stamp all local trails with userId
  const trails = trailStore(db);
  const allTrails = await db.trails.filter((t) => !t.userId).toArray();
  for (const trail of allTrails) {
    await trails.update(trail.id, {
      userId: userId,
      syncStatus: SyncStatus.PendingSync,
    } as any);
  }

  const backend = new SupabaseBackend(supabase, userId);
  engine = new SyncEngine(db, backend, stateStore, userId);
  return true;
}

export async function handleSyncMessage(
  db: BreadcrumbsDB,
  type: "enableSync" | "disableSync" | "syncNow" | "getSyncStatus"
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  switch (type) {
    case "enableSync": {
      const ok = await ensureInitialized(db);
      if (!ok) return { success: false, error: "Failed to initialize sync" };
      const report = await engine!.syncNow();
      lastReport = report;
      return { success: true, data: report };
    }
    case "disableSync": {
      engine = null;
      supabase = null;
      userId = null;
      return { success: true };
    }
    case "syncNow": {
      if (!engine) {
        const ok = await ensureInitialized(db);
        if (!ok) return { success: false, error: "Sync not initialized" };
      }
      const report = await engine!.syncNow();
      lastReport = report;
      return { success: true, data: report };
    }
    case "getSyncStatus": {
      const lastSyncTime = await stateStore.getLastSyncTime();
      return {
        success: true,
        data: { lastSyncTime, lastReport, isEnabled: !!engine },
      };
    }
  }
}
```

- [ ] **Step 2: Wire sync handler into offscreen entry**

Update `packages/extension/src/offscreen/index.ts` to handle sync messages. Add after the existing handler:

```typescript
import { handleSyncMessage } from "./sync-handler.js";
```

In the `onMessage` listener, before calling `handleOffscreenMessage`, check for sync types:

```typescript
chrome.runtime.onMessage.addListener(
  (message: any, _sender, sendResponse) => {
    if (message.target !== "offscreen") return false;

    const req = message.request;
    if (req.type === "enableSync" || req.type === "disableSync" ||
        req.type === "syncNow" || req.type === "getSyncStatus") {
      handleSyncMessage(db, req.type).then(sendResponse);
    } else {
      handleOffscreenMessage(db, req).then(sendResponse);
    }
    return true;
  }
);
```

- [ ] **Step 3: Commit**

```bash
git add packages/extension/src/offscreen/sync-handler.ts packages/extension/src/offscreen/index.ts
git commit -m "feat(extension): add sync handler in offscreen document"
```

---

### Task 12: Background Sync Alarm

**Files:**
- Modify: `packages/extension/src/background/index.ts`

- [ ] **Step 1: Add sync alarm handling**

First, update the `settings` variable declaration to use the full type:

```typescript
import type { ExtensionSettings } from "../shared/settings.js";
// Change: let settings = { idleTimeoutMinutes: 30, captureEnabled: true };
// To:
let settings: ExtensionSettings = { idleTimeoutMinutes: 30, captureEnabled: true, syncEnabled: false };
```

Add the sync alarm constant and integrate into the **existing** `storage.onChanged` listener (don't create a second listener):

```typescript
// Sync alarm — 5 minute interval when sync is enabled
const SYNC_ALARM = "sync-interval";

chrome.storage.onChanged.addListener((changes) => {
  // ... existing settings listeners ...
  if (changes.syncEnabled) {
    if (changes.syncEnabled.newValue) {
      chrome.alarms.create(SYNC_ALARM, { periodInMinutes: 5 });
      // Initial sync
      sendToOffscreen({ type: "enableSync" });
    } else {
      chrome.alarms.clear(SYNC_ALARM);
      sendToOffscreen({ type: "disableSync" });
    }
  }
});
```

Update the alarm listener to handle sync:

```typescript
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "reconcile-trails") {
    await reconcileActiveTrails();
    return;
  }
  if (alarm.name === SYNC_ALARM) {
    await sendToOffscreen({ type: "syncNow" });
    return;
  }
  const tabId = parseTabIdFromAlarm(alarm.name);
  if (tabId !== null) trailManager.removeTab(tabId);
});
```

On startup, restore the sync alarm if sync is enabled:

```typescript
// In initialize():
async function initialize() {
  deviceId = await getDeviceId();
  settings = await getSettings();
  if (settings.syncEnabled) {
    chrome.alarms.create(SYNC_ALARM, { periodInMinutes: 5 });
  }
}
```

- [ ] **Step 2: Verify build**

Run: `cd packages/extension && pnpm build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add packages/extension/src/background/index.ts
git commit -m "feat(extension): add sync alarm with 5-minute interval"
```

---

### Task 13: Options Page Sync UI

**Files:**
- Modify: `packages/extension/src/options/SettingsForm.svelte`

- [ ] **Step 1: Add sync controls to settings form**

Add after the capture enabled field:

```svelte
    <hr />

    <div class="field">
      <label>
        <input type="checkbox" bind:checked={settings.syncEnabled} />
        Sync to cloud
      </label>
      <p class="help">Sync trails to Supabase. Data is stored anonymously.</p>
    </div>

    {#if settings.syncEnabled}
      <div class="field">
        <button type="button" class="sync-btn" onclick={handleSyncNow} disabled={syncing}>
          {syncing ? "Syncing..." : "Sync now"}
        </button>
        {#if syncStatus}
          <p class="help">
            Last synced: {syncStatus.lastSyncTime
              ? new Date(syncStatus.lastSyncTime).toLocaleString(undefined, { year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })
              : "Never"}
          </p>
        {/if}
      </div>
    {/if}
```

Add the script logic:

```typescript
  let syncing = $state(false);
  let syncStatus: any = $state(null);

  async function loadSyncStatus() {
    const response = await chrome.runtime.sendMessage({
      type: "getSyncStatus",
    });
    if (response?.success) syncStatus = response.data;
  }

  async function handleSyncNow() {
    syncing = true;
    await chrome.runtime.sendMessage({ type: "syncNow" });
    await loadSyncStatus();
    syncing = false;
  }

  // Load sync status on mount
  loadSyncStatus();
```

Note: The `getSyncStatus` and `syncNow` messages go to the background, which forwards to offscreen. Add these to the background message handler:

In `packages/extension/src/background/index.ts`, add to `handleBackgroundMessage`:

```typescript
    case "getSyncStatus":
    case "syncNow":
    case "enableSync":
    case "disableSync": {
      const result = await sendToOffscreen(message as any);
      sendResponse(result);
      break;
    }
```

Note: `BackgroundMessage` and `OffscreenRequest` were already updated in Task 10 to include these sync types.

- [ ] **Step 2: Add sync button styles**

```css
  .sync-btn { padding: 8px 20px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; }
  .sync-btn:hover { background: #218838; }
  .sync-btn:disabled { background: #ccc; cursor: not-allowed; }
```

- [ ] **Step 3: Verify build**

Run: `cd packages/extension && pnpm build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add packages/extension/src/options/SettingsForm.svelte packages/extension/src/background/index.ts packages/extension/src/shared/messaging.ts
git commit -m "feat(extension): add sync toggle and sync-now button to options page"
```

---

### Task 14: Build Verification + Manual Test

- [ ] **Step 1: Rebuild shared library**

Run: `cd packages/shared && node_modules/.bin/vite build`
Expected: Build succeeds

- [ ] **Step 2: Run all shared tests**

Run: `cd packages/shared && node_modules/.bin/vitest run`
Expected: All tests pass

- [ ] **Step 3: Run all extension tests**

Run: `cd packages/extension && node_modules/.bin/vitest run`
Expected: All tests pass

- [ ] **Step 4: Build extension**

Run: `cd packages/extension && pnpm build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git commit --allow-empty -m "chore: sync layer implementation complete — ready for manual testing"
```

---

## Summary

**What this produces:**
- `SyncBackend` interface + Supabase implementation with field mapping
- `SyncEngine` with push/pull, conflict detection, concurrency guard, client-side cleanup
- Anonymous Supabase auth (auto on first sync enable)
- Extension options page with sync toggle + sync now button
- Background alarm for 5-minute periodic sync
- User ID stamping on first sync enable
- `.env.example` for Supabase credentials

**Test coverage:**
- Field mapper (unit tests)
- Supabase backend (unit tests with mock client)
- Sync engine push/pull/conflict/concurrency (integration tests with fake-indexeddb)
- Settings (existing tests updated)

**To test manually:**
1. Set up Supabase per `docs/setup/supabase-setup.md`
2. Copy `.env.example` to `.env` and fill in credentials
3. Build and load extension
4. Go to Options → enable "Sync to cloud"
5. Browse Wikipedia, create trails
6. Click "Sync now" to verify data appears in Supabase dashboard
