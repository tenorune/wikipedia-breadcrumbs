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
      id: crypto.randomUUID(), trailId, url: "https://en.wikipedia.org/wiki/A",
      title: "A", timestamp: new Date().toISOString(), position: 1,
      sourceType: "link", sourceDetail: null, tabId: null, windowId: null,
      note: null, summary: null, thumbnailUrl: null, language: "en",
      articleId: "1", syncStatus: "local_only", updatedAt: new Date().toISOString(), deletedAt: null,
    };
    const visit2 = { ...visit1, id: crypto.randomUUID(), position: 2, title: "B", url: "https://en.wikipedia.org/wiki/B", articleId: "2" };
    await db.visits.bulkAdd([visit1, visit2]);
    const results = await db.visits.where("trailId").equals(trailId).toArray();
    expect(results).toHaveLength(2);
  });
});
