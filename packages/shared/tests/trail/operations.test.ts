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
  afterEach(async () => { await db.delete(); });

  it("splits a trail at the given position", async () => {
    const trail = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    await db.trails.add(trail);
    const visits = [1, 2, 3, 4].map((pos) =>
      createVisit({ trailId: trail.id, url: `https://en.wikipedia.org/wiki/Page${pos}`, title: `Page ${pos}`, position: pos, sourceType: SourceType.Link, language: "en", articleId: String(pos) })
    );
    await db.visits.bulkAdd(visits);

    const [originalId, newId] = await splitTrail(db, trail.id, 2);

    const originalVisits = await db.visits.where("trailId").equals(originalId).sortBy("position");
    const newVisits = await db.visits.where("trailId").equals(newId).sortBy("position");

    expect(originalVisits).toHaveLength(2);
    expect(originalVisits[0].title).toBe("Page 1");
    expect(originalVisits[1].title).toBe("Page 2");
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
      createVisit({ trailId: trail.id, url: `https://en.wikipedia.org/wiki/P${pos}`, title: `P${pos}`, position: pos, sourceType: SourceType.Link, language: "en", articleId: String(pos) })
    );
    await db.visits.bulkAdd(visits);
    const [, newId] = await splitTrail(db, trail.id, 1);
    const newVisits = await db.visits.where("trailId").equals(newId).toArray();
    for (const v of newVisits) { expect(v.syncStatus).toBe(SyncStatus.PendingSync); }
  });
});

describe("mergeTrails", () => {
  let db: BreadcrumbsDB;

  beforeEach(async () => {
    db = new BreadcrumbsDB("test-merge-" + crypto.randomUUID());
    await db.open();
  });
  afterEach(async () => { await db.delete(); });

  it("merges two trails by interleaving visits by timestamp", async () => {
    const t1 = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    const t2 = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    await db.trails.bulkAdd([t1, t2]);

    const v1 = createVisit({ trailId: t1.id, url: "https://en.wikipedia.org/wiki/A", title: "A", position: 1, sourceType: SourceType.Link, language: "en", articleId: "1" });
    (v1 as any).timestamp = "2026-01-01T00:00:00Z";
    const v2 = createVisit({ trailId: t2.id, url: "https://en.wikipedia.org/wiki/B", title: "B", position: 1, sourceType: SourceType.Link, language: "en", articleId: "2" });
    (v2 as any).timestamp = "2026-01-01T00:01:00Z";
    const v3 = createVisit({ trailId: t1.id, url: "https://en.wikipedia.org/wiki/C", title: "C", position: 2, sourceType: SourceType.Link, language: "en", articleId: "3" });
    (v3 as any).timestamp = "2026-01-01T00:02:00Z";
    await db.visits.bulkAdd([v1, v2, v3]);

    const mergedId = await mergeTrails(db, t1.id, t2.id);
    expect(mergedId).toBe(t1.id);

    const visits = await db.visits.where("trailId").equals(mergedId).sortBy("position");
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
    const v1 = createVisit({ trailId: t2.id, url: "https://en.wikipedia.org/wiki/X", title: "X", position: 1, sourceType: SourceType.Link, language: "en", articleId: "10" });
    await db.visits.add(v1);
    await mergeTrails(db, t1.id, t2.id);
    const visit = await db.visits.get(v1.id);
    expect(visit?.trailId).toBe(t1.id);
    expect(visit?.syncStatus).toBe(SyncStatus.PendingSync);
  });
});
