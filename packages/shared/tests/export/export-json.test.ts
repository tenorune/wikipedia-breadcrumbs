import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { BreadcrumbsDB } from "../../src/db/schema.js";
import { createTrail } from "../../src/models/trail.js";
import { createVisit } from "../../src/models/visit.js";
import { StartReason, SourceType } from "../../src/models/enums.js";
import { exportTrailsJson } from "../../src/export/export-json.js";

describe("exportTrailsJson", () => {
  let db: BreadcrumbsDB;

  beforeEach(async () => {
    db = new BreadcrumbsDB("test-export-" + crypto.randomUUID());
    await db.open();
  });
  afterEach(async () => { await db.delete(); });

  it("exports all trails with nested visits", async () => {
    const trail = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    await db.trails.add(trail);
    const visit = createVisit({
      trailId: trail.id, url: "https://en.wikipedia.org/wiki/Test",
      title: "Test", position: 1, sourceType: SourceType.Link,
      language: "en", articleId: "Test",
    });
    await db.visits.add(visit);

    const json = await exportTrailsJson(db);
    const data = JSON.parse(json);

    expect(data.version).toBe(1);
    expect(data.exportedAt).toBeDefined();
    expect(data.trails).toHaveLength(1);
    expect(data.trails[0].id).toBe(trail.id);
    expect(data.trails[0].visits).toHaveLength(1);
    expect(data.trails[0].visits[0].title).toBe("Test");
  });

  it("excludes soft-deleted trails and visits", async () => {
    const trail = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    await db.trails.add(trail);
    const deletedTrail = createTrail({ startReason: StartReason.Manual, deviceId: "d1" });
    await db.trails.add({ ...deletedTrail, deletedAt: new Date().toISOString() });

    const json = await exportTrailsJson(db);
    const data = JSON.parse(json);
    expect(data.trails).toHaveLength(1);
    expect(data.trails[0].id).toBe(trail.id);
  });

  it("excludes internal fields", async () => {
    const trail = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    await db.trails.add(trail);
    const visit = createVisit({
      trailId: trail.id, url: "https://en.wikipedia.org/wiki/Test",
      title: "Test", position: 1, sourceType: SourceType.Link,
      language: "en", articleId: "Test", tabId: 42, windowId: 1,
    });
    await db.visits.add(visit);

    const json = await exportTrailsJson(db);
    const data = JSON.parse(json);
    const t = data.trails[0];
    const v = t.visits[0];

    expect(t.userId).toBeUndefined();
    expect(t.syncStatus).toBeUndefined();
    expect(t.deviceId).toBeUndefined();
    expect(t.deletedAt).toBeUndefined();
    expect(v.syncStatus).toBeUndefined();
    expect(v.tabId).toBeUndefined();
    expect(v.windowId).toBeUndefined();
    expect(v.deletedAt).toBeUndefined();
    expect(t.updatedAt).toBeDefined();
    expect(v.updatedAt).toBeDefined();
  });

  it("exports specific trails by ID", async () => {
    const t1 = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    const t2 = createTrail({ startReason: StartReason.Manual, deviceId: "d1" });
    await db.trails.bulkAdd([t1, t2]);

    const json = await exportTrailsJson(db, [t1.id]);
    const data = JSON.parse(json);
    expect(data.trails).toHaveLength(1);
    expect(data.trails[0].id).toBe(t1.id);
  });
});
