import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createVisit, createTrail, SourceType, StartReason } from "@wikipedia-breadcrumbs/shared";
import * as data from "../../src/background/data-layer.js";

describe("data-layer", () => {
  beforeEach(async () => {
    await data.db.open();
    await data.db.trails.clear();
    await data.db.visits.clear();
    data.setSyncUserId(null);
  });
  afterEach(async () => {
    await data.db.trails.clear();
    await data.db.visits.clear();
  });

  it("addTrail stores a trail", async () => {
    const trail = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    await data.addTrail(trail);
    expect(await data.db.trails.get(trail.id)).toBeDefined();
  });

  it("addVisit stores a visit", async () => {
    const visit = createVisit({ trailId: "t1", url: "https://en.wikipedia.org/wiki/Test", title: "Test", position: 1, sourceType: SourceType.Link, language: "en", articleId: "Test" });
    await data.addVisit(visit);
    expect(await data.db.visits.get(visit.id)).toBeDefined();
  });

  it("getTrailsAll returns all non-deleted trails", async () => {
    await data.addTrail(createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" }));
    expect((await data.getTrailsAll()).length).toBe(1);
  });

  it("getActiveTrailForTab finds trail by tab's latest visit", async () => {
    const trail = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    await data.addTrail(trail);
    const visit = createVisit({ trailId: trail.id, url: "https://en.wikipedia.org/wiki/Test", title: "Test", position: 1, sourceType: SourceType.Link, language: "en", articleId: "Test", tabId: 42 });
    await data.addVisit(visit);
    const found = await data.getActiveTrailForTab(42);
    expect(found?.trail.id).toBe(trail.id);
  });

  it("getActiveTrailForTab returns null for unknown tab", async () => {
    expect(await data.getActiveTrailForTab(999)).toBeNull();
  });

  it("finalizeTrail sets status to finalized", async () => {
    const trail = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    await data.addTrail(trail);
    await data.finalizeTrail(trail.id);
    const stored = await data.db.trails.get(trail.id);
    expect(stored?.status).toBe("finalized");
    expect(stored?.endedAt).not.toBeNull();
  });

  it("searchVisits finds visits by title substring", async () => {
    const trail = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    (trail as any).id = "t1";
    await data.addTrail(trail);
    await data.addVisit(createVisit({ trailId: "t1", url: "https://en.wikipedia.org/wiki/Rust", title: "Rust (programming language)", position: 1, sourceType: SourceType.Link, language: "en", articleId: "Rust" }));
    expect((await data.searchVisits("rust")).length).toBe(1);
  });

  it("findVisitByUrl matches by exact url then articleId", async () => {
    const trail = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    (trail as any).id = "t1";
    await data.addTrail(trail);
    await data.addVisit(createVisit({ trailId: "t1", url: "https://en.wikipedia.org/wiki/Sahabah", title: "Companions of the Prophet", position: 1, sourceType: SourceType.Link, language: "en", articleId: "Sahabah" }));
    const byUrl = await data.findVisitByUrl("t1", "https://en.wikipedia.org/wiki/Sahabah");
    expect(byUrl?.articleId).toBe("Sahabah");
    const byArticle = await data.findVisitByUrl("t1", "https://en.wikipedia.org/wiki/Sahabah?x=1");
    expect(byArticle?.articleId).toBe("Sahabah");
  });
});
