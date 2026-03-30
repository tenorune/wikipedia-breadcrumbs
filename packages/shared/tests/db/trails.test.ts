import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { BreadcrumbsDB } from "../../src/db/schema.js";
import { trailStore } from "../../src/db/trails.js";
import { createTrail } from "../../src/models/trail.js";
import { StartReason, TrailStatus, SyncStatus } from "../../src/models/enums.js";

describe("trailStore", () => {
  let db: BreadcrumbsDB;
  let store: ReturnType<typeof trailStore>;

  const makeTrail = (overrides: Record<string, unknown> = {}) =>
    createTrail({ startReason: StartReason.AutoNewTab, deviceId: "device-1", ...overrides });

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
    const result = await store.update(trail.id, { name: "My Trail", isStarred: true });
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
