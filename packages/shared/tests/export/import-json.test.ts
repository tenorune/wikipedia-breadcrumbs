import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { BreadcrumbsDB } from "../../src/db/schema.js";
import { createTrail } from "../../src/models/trail.js";
import { createVisit } from "../../src/models/visit.js";
import { StartReason, SourceType, SyncStatus } from "../../src/models/enums.js";
import { parseImportJson, detectConflicts, executeImport } from "../../src/export/import-json.js";
import type { ExportTrail, ExportVisit, ImportPlan } from "../../src/export/types.js";

const makeVisit = (id: string, parentVisitId: string | null = null, position = 1): ExportVisit => ({
  id, url: "https://en.wikipedia.org/wiki/Test", title: "Test",
  timestamp: "2026-04-02T00:00:00Z", lastVisitedAt: "2026-04-02T00:00:00Z",
  updatedAt: "2026-04-02T00:00:00Z", position, sourceType: "link",
  sourceDetail: null, note: null, summary: null, thumbnailUrl: null,
  language: "en", articleId: "Test", parentVisitId,
});

const makeTrail = (id: string, visits: ExportVisit[] = []): ExportTrail => ({
  id, name: "Trail", createdAt: "2026-04-02T00:00:00Z", startedAt: "2026-04-02T00:00:00Z",
  endedAt: null, updatedAt: "2026-04-02T00:00:00Z", status: "finalized", isStarred: false,
  tags: [], note: null, visibility: "private", forkedFromVisitId: null, startReason: "manual",
  visits,
});

describe("parseImportJson", () => {
  it("parses valid export JSON", () => {
    const json = JSON.stringify({
      version: 1,
      exportedAt: "2026-04-02T00:00:00Z",
      trails: [makeTrail("abc", [makeVisit("v1")])],
    });
    const result = parseImportJson(json);
    expect(result.errors).toHaveLength(0);
    expect(result.trails).toHaveLength(1);
    expect(result.trails[0].visits).toHaveLength(1);
  });

  it("rejects invalid JSON", () => {
    const result = parseImportJson("not json");
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.trails).toHaveLength(0);
  });

  it("rejects unsupported version", () => {
    const result = parseImportJson(JSON.stringify({ version: 99, exportedAt: "", trails: [] }));
    expect(result.errors[0]).toContain("update");
  });

  it("rejects invalid enum values", () => {
    const json = JSON.stringify({
      version: 1, exportedAt: "2026-04-02T00:00:00Z",
      trails: [{ ...makeTrail("abc"), status: "INVALID" }],
    });
    const result = parseImportJson(json);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects missing required fields", () => {
    const json = JSON.stringify({
      version: 1, exportedAt: "2026-04-02T00:00:00Z",
      trails: [{ id: "abc" }],
    });
    const result = parseImportJson(json);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe("detectConflicts", () => {
  let db: BreadcrumbsDB;
  beforeEach(async () => {
    db = new BreadcrumbsDB("test-conflict-" + crypto.randomUUID());
    await db.open();
  });
  afterEach(async () => { await db.delete(); });

  it("separates clean and conflicting trails", async () => {
    const local = createTrail({ startReason: StartReason.Manual, deviceId: "d1" });
    await db.trails.add(local);

    const imported = [
      makeTrail(local.id),
      makeTrail("new-id"),
    ];

    const result = await detectConflicts(db, imported);
    expect(result.clean).toHaveLength(1);
    expect(result.clean[0].id).toBe("new-id");
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].imported.id).toBe(local.id);
  });
});

describe("executeImport", () => {
  let db: BreadcrumbsDB;
  beforeEach(async () => {
    db = new BreadcrumbsDB("test-exec-" + crypto.randomUUID());
    await db.open();
  });
  afterEach(async () => { await db.delete(); });

  it("imports trails with overwrite action", async () => {
    const trail = makeTrail("t1", [makeVisit("v1")]);
    const plan: ImportPlan = { items: [{ trail, action: "overwrite" }] };
    const result = await executeImport(db, plan, { userId: null, deviceId: "dev1" });

    expect(result.trailsImported).toBe(1);
    expect(result.visitsImported).toBe(1);
    const stored = await db.trails.get("t1");
    expect(stored).toBeDefined();
    expect(stored!.deviceId).toBe("dev1");
    expect(stored!.syncStatus).toBe(SyncStatus.LocalOnly);
  });

  it("skips trails marked as skip", async () => {
    const plan: ImportPlan = { items: [{ trail: makeTrail("t1"), action: "skip" }] };
    const result = await executeImport(db, plan, { userId: null, deviceId: "dev1" });
    expect(result.skipped).toBe(1);
    expect(result.trailsImported).toBe(0);
  });

  it("overwrites existing trail and its visits", async () => {
    const local = createTrail({ startReason: StartReason.Manual, deviceId: "d1" });
    await db.trails.add({ ...local, id: "existing" });
    const localVisit = createVisit({
      trailId: "existing", url: "https://en.wikipedia.org/wiki/Old",
      title: "Old", position: 1, sourceType: SourceType.Link,
      language: "en", articleId: "Old",
    });
    await db.visits.add(localVisit);

    const imported = makeTrail("existing", [makeVisit("v-new")]);
    const plan: ImportPlan = { items: [{ trail: imported, action: "overwrite" }] };
    const result = await executeImport(db, plan, { userId: null, deviceId: "dev1" });

    expect(result.trailsImported).toBe(1);
    const visits = await db.visits.where("trailId").equals("existing").filter((v) => !v.deletedAt).toArray();
    expect(visits).toHaveLength(1);
    expect(visits[0].id).toBe("v-new");
  });

  it("copies trail with fresh IDs and remaps parentVisitId", async () => {
    const v1 = makeVisit("orig-v1", null, 1);
    const v2 = makeVisit("orig-v2", "orig-v1", 2);
    const imported = makeTrail("orig-t1", [v1, v2]);

    // Put original in DB so it's a conflict
    const local = createTrail({ startReason: StartReason.Manual, deviceId: "d1" });
    await db.trails.add({ ...local, id: "orig-t1" });

    const plan: ImportPlan = { items: [{ trail: imported, action: "copy" }] };
    const result = await executeImport(db, plan, { userId: null, deviceId: "dev1" });

    expect(result.trailsImported).toBe(1);
    const allTrails = await db.trails.toArray();
    expect(allTrails).toHaveLength(2);
    const copy = allTrails.find((t) => t.id !== "orig-t1")!;
    expect(copy).toBeDefined();

    const copyVisits = await db.visits.where("trailId").equals(copy.id).sortBy("position");
    expect(copyVisits).toHaveLength(2);
    expect(copyVisits[0].id).not.toBe("orig-v1");
    expect(copyVisits[1].id).not.toBe("orig-v2");
    expect(copyVisits[1].parentVisitId).toBe(copyVisits[0].id);
  });
});
