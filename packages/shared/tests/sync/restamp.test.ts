import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { BreadcrumbsDB } from "../../src/db/schema.js";
import { createTrail, createVisit, StartReason, SourceType, SyncStatus } from "../../src/models/index.js";
import { restampForUser } from "../../src/sync/restamp.js";

describe("restampForUser", () => {
  let db: BreadcrumbsDB;

  beforeEach(async () => {
    db = new BreadcrumbsDB("test-restamp-" + crypto.randomUUID());
    await db.open();
  });

  afterEach(async () => { await db.delete(); });

  function makeVisit(syncStatus: SyncStatus) {
    const v = createVisit({
      trailId: "t1", url: "https://en.wikipedia.org/wiki/Test",
      title: "Test", position: 1, sourceType: SourceType.Link,
      language: "en", articleId: "Test",
    });
    v.syncStatus = syncStatus;
    return v;
  }

  it("stamps foreign/unowned trails with userId + PendingSync, leaves owned ones alone", async () => {
    const foreign = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    foreign.userId = "someone-else";
    foreign.syncStatus = SyncStatus.Synced;
    foreign.updatedAt = "2026-01-01T00:00:00Z";
    const owned = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    owned.userId = "user-123";
    owned.syncStatus = SyncStatus.Synced;
    await db.trails.bulkAdd([foreign, owned]);

    await restampForUser(db, "user-123", { includeSyncedVisits: false });

    const f = await db.trails.get(foreign.id);
    expect(f?.userId).toBe("user-123");
    expect(f?.syncStatus).toBe(SyncStatus.PendingSync);
    expect(f?.updatedAt).toBe("2026-01-01T00:00:00Z"); // untouched
    const o = await db.trails.get(owned.id);
    expect(o?.syncStatus).toBe(SyncStatus.Synced); // untouched
  });

  it("with includeSyncedVisits:false, re-stamps only non-Synced visits", async () => {
    const synced = makeVisit(SyncStatus.Synced);
    const localOnly = makeVisit(SyncStatus.LocalOnly);
    await db.visits.bulkAdd([synced, localOnly]);

    await restampForUser(db, "user-123", { includeSyncedVisits: false });

    expect((await db.visits.get(synced.id))?.syncStatus).toBe(SyncStatus.Synced);
    expect((await db.visits.get(localOnly.id))?.syncStatus).toBe(SyncStatus.PendingSync);
  });

  it("with includeSyncedVisits:true, re-stamps every visit", async () => {
    const synced = makeVisit(SyncStatus.Synced);
    const localOnly = makeVisit(SyncStatus.LocalOnly);
    await db.visits.bulkAdd([synced, localOnly]);

    await restampForUser(db, "user-123", { includeSyncedVisits: true });

    expect((await db.visits.get(synced.id))?.syncStatus).toBe(SyncStatus.PendingSync);
    expect((await db.visits.get(localOnly.id))?.syncStatus).toBe(SyncStatus.PendingSync);
  });
});
