import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { BreadcrumbsDB, createVisit, createTrail, SourceType, StartReason } from "@wikipedia-breadcrumbs/shared";
import { handleOffscreenMessage } from "../../src/offscreen/handler.js";

describe("handleOffscreenMessage", () => {
  let db: BreadcrumbsDB;

  beforeEach(async () => {
    db = new BreadcrumbsDB("test-offscreen-" + crypto.randomUUID());
    await db.open();
  });
  afterEach(async () => { await db.delete(); });

  it("addTrail stores a trail", async () => {
    const trail = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    const result = await handleOffscreenMessage(db, { type: "addTrail", trail });
    expect(result.success).toBe(true);
  });

  it("addVisit stores a visit", async () => {
    const visit = createVisit({ trailId: "t1", url: "https://en.wikipedia.org/wiki/Test", title: "Test", position: 1, sourceType: SourceType.Link, language: "en", articleId: "Test" });
    const result = await handleOffscreenMessage(db, { type: "addVisit", visit });
    expect(result.success).toBe(true);
  });

  it("getTrailsAll returns all non-deleted trails", async () => {
    const trail = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    await db.trails.add(trail);
    const result = await handleOffscreenMessage(db, { type: "getTrailsAll" });
    expect(result.success).toBe(true);
    if (result.success) expect((result.data as any[]).length).toBe(1);
  });

  it("getActiveTrailForTab finds trail by tab's latest visit", async () => {
    const trail = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    await db.trails.add(trail);
    const visit = createVisit({ trailId: trail.id, url: "https://en.wikipedia.org/wiki/Test", title: "Test", position: 1, sourceType: SourceType.Link, language: "en", articleId: "Test", tabId: 42 });
    await db.visits.add(visit);
    const result = await handleOffscreenMessage(db, { type: "getActiveTrailForTab", tabId: 42 });
    expect(result.success).toBe(true);
    if (result.success) expect((result.data as any)?.trail.id).toBe(trail.id);
  });

  it("getActiveTrailForTab returns null for unknown tab", async () => {
    const result = await handleOffscreenMessage(db, { type: "getActiveTrailForTab", tabId: 999 });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBeNull();
  });

  it("finalizeTrail sets status to finalized", async () => {
    const trail = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    await db.trails.add(trail);
    await handleOffscreenMessage(db, { type: "finalizeTrail", trailId: trail.id });
    const stored = await db.trails.get(trail.id);
    expect(stored?.status).toBe("finalized");
    expect(stored?.endedAt).not.toBeNull();
  });

  it("searchVisits finds visits by title substring", async () => {
    const visit = createVisit({ trailId: "t1", url: "https://en.wikipedia.org/wiki/Rust", title: "Rust (programming language)", position: 1, sourceType: SourceType.Link, language: "en", articleId: "Rust" });
    await db.visits.add(visit);
    // Need a non-deleted trail for the search to find visits
    const trail = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    (trail as any).id = "t1";
    await db.trails.add(trail);
    const result = await handleOffscreenMessage(db, { type: "searchVisits", query: "rust" });
    expect(result.success).toBe(true);
    if (result.success) expect((result.data as any[]).length).toBe(1);
  });
});
