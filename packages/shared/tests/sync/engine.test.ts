import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { BreadcrumbsDB } from "../../src/db/schema.js";
import { visitStore } from "../../src/db/visits.js";
import { trailStore } from "../../src/db/trails.js";
import { createTrail, createVisit, StartReason, SourceType, SyncStatus } from "../../src/models/index.js";
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
  let db: BreadcrumbsDB;
  let backend: ReturnType<typeof mockBackend>;
  let stateStore: ReturnType<typeof mockStateStore>;
  let engine: SyncEngine;

  beforeEach(async () => {
    db = new BreadcrumbsDB("test-sync-" + crypto.randomUUID());
    await db.open();
    backend = mockBackend();
    stateStore = mockStateStore();
    engine = new SyncEngine(db, backend, stateStore, "user-123");
  });

  afterEach(async () => { await db.delete(); });

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
    expect(report2.errors).toContain("Sync already in progress");
  });
});
