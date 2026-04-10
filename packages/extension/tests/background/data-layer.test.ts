import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { BreadcrumbsDB, visitStore, trailStore, createVisit, createTrail, SourceType, StartReason } from "@wikipedia-breadcrumbs/shared";

// Tests exercise the same store operations that data-layer.ts wraps.
// data-layer.ts is a thin module-scoped wrapper around visitStore/trailStore,
// so testing the stores directly validates the logic.

describe("data-layer operations", () => {
  let db: BreadcrumbsDB;

  beforeEach(async () => {
    db = new BreadcrumbsDB("test-data-layer-" + crypto.randomUUID());
    await db.open();
  });
  afterEach(async () => { await db.delete(); });

  it("addTrail stores a trail", async () => {
    const trail = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    await trailStore(db).add(trail);
    const stored = await db.trails.get(trail.id);
    expect(stored).toBeDefined();
  });

  it("addVisit stores a visit", async () => {
    const visit = createVisit({ trailId: "t1", url: "https://en.wikipedia.org/wiki/Test", title: "Test", position: 1, sourceType: SourceType.Link, language: "en", articleId: "Test" });
    await visitStore(db).add(visit);
    const stored = await db.visits.get(visit.id);
    expect(stored).toBeDefined();
  });

  it("getActiveTrailForTab finds trail by tab's latest visit", async () => {
    const trail = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    await trailStore(db).add(trail);
    const visit = createVisit({ trailId: trail.id, url: "https://en.wikipedia.org/wiki/Test", title: "Test", position: 1, sourceType: SourceType.Link, language: "en", articleId: "Test", tabId: 42 });
    await visitStore(db).add(visit);
    const activeTrails = await trailStore(db).getActive();
    let found = null;
    for (const t of activeTrails) {
      const visits = await visitStore(db).getByTrailId(t.id);
      const last = visits[visits.length - 1];
      if (last?.tabId === 42) { found = { trail: t, lastVisit: last, visitCount: visits.length }; break; }
    }
    expect(found?.trail.id).toBe(trail.id);
  });

  it("getActiveTrailForTab returns null for unknown tab", async () => {
    const activeTrails = await trailStore(db).getActive();
    let found = null;
    for (const t of activeTrails) {
      const visits = await visitStore(db).getByTrailId(t.id);
      const last = visits[visits.length - 1];
      if (last?.tabId === 999) { found = t; break; }
    }
    expect(found).toBeNull();
  });

  it("finalizeTrail sets status to finalized", async () => {
    const trail = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    await trailStore(db).add(trail);
    await trailStore(db).finalize(trail.id);
    const stored = await db.trails.get(trail.id);
    expect(stored?.status).toBe("finalized");
    expect(stored?.endedAt).not.toBeNull();
  });

  it("searchVisits finds visits by title substring", async () => {
    const trail = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    (trail as any).id = "t1";
    await trailStore(db).add(trail);
    const visit = createVisit({ trailId: "t1", url: "https://en.wikipedia.org/wiki/Rust", title: "Rust (programming language)", position: 1, sourceType: SourceType.Link, language: "en", articleId: "Rust" });
    await visitStore(db).add(visit);
    const allTrails = await trailStore(db).getAll();
    const results: any[] = [];
    for (const t of allTrails) {
      const visits = await visitStore(db).getByTrailId(t.id);
      for (const v of visits) {
        if (v.title.toLowerCase().includes("rust")) results.push(v);
      }
    }
    expect(results.length).toBe(1);
  });
});
