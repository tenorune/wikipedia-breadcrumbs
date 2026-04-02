import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { BreadcrumbsDB } from "../../src/db/schema.js";
import { createTrail } from "../../src/models/trail.js";
import { createVisit } from "../../src/models/visit.js";
import { StartReason, SourceType } from "../../src/models/enums.js";
import { exportTrailsCsv } from "../../src/export/export-csv.js";

describe("exportTrailsCsv", () => {
  let db: BreadcrumbsDB;

  beforeEach(async () => {
    db = new BreadcrumbsDB("test-csv-" + crypto.randomUUID());
    await db.open();
  });
  afterEach(async () => { await db.delete(); });

  it("exports header row and one data row per visit", async () => {
    const trail = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    await db.trails.add({ ...trail, name: "My Trail" });
    const visit = createVisit({
      trailId: trail.id, url: "https://en.wikipedia.org/wiki/Test",
      title: "Test Page", position: 1, sourceType: SourceType.Link,
      language: "en", articleId: "Test",
    });
    await db.visits.add(visit);

    const csv = await exportTrailsCsv(db);
    const lines = csv.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("trail_id");
    expect(lines[1]).toContain("My Trail");
    expect(lines[1]).toContain("Test Page");
  });

  it("escapes commas and quotes in fields", async () => {
    const trail = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    await db.trails.add({ ...trail, name: 'Trail "with" commas, and quotes' });
    const visit = createVisit({
      trailId: trail.id, url: "https://en.wikipedia.org/wiki/Test",
      title: "Test", position: 1, sourceType: SourceType.Link,
      language: "en", articleId: "Test",
    });
    await db.visits.add(visit);

    const csv = await exportTrailsCsv(db);
    const lines = csv.trim().split("\n");
    expect(lines[1]).toContain('"Trail ""with"" commas, and quotes"');
  });

  it("serializes tags as semicolon-delimited", async () => {
    const trail = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    await db.trails.add({ ...trail, tags: ["history", "science"] });
    const visit = createVisit({
      trailId: trail.id, url: "https://en.wikipedia.org/wiki/Test",
      title: "Test", position: 1, sourceType: SourceType.Link,
      language: "en", articleId: "Test",
    });
    await db.visits.add(visit);

    const csv = await exportTrailsCsv(db);
    expect(csv).toContain("history;science");
  });
});
