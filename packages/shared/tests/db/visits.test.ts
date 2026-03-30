import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { BreadcrumbsDB } from "../../src/db/schema.js";
import { visitStore } from "../../src/db/visits.js";
import { createVisit } from "../../src/models/visit.js";
import { SourceType, SyncStatus } from "../../src/models/enums.js";

describe("visitStore", () => {
  let db: BreadcrumbsDB;
  let store: ReturnType<typeof visitStore>;

  const makeVisit = (overrides: Record<string, unknown> = {}) =>
    createVisit({
      trailId: "trail-1",
      url: "https://en.wikipedia.org/wiki/Test",
      title: "Test",
      position: 1,
      sourceType: SourceType.Link,
      language: "en",
      articleId: "123",
      ...overrides,
    });

  beforeEach(async () => {
    db = new BreadcrumbsDB("test-visits-" + crypto.randomUUID());
    store = visitStore(db);
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it("add stores a visit and returns it", async () => {
    const visit = makeVisit();
    const result = await store.add(visit);
    expect(result.id).toBe(visit.id);
    const retrieved = await store.getById(visit.id);
    expect(retrieved?.title).toBe("Test");
  });

  it("getByTrailId returns visits sorted by position", async () => {
    const v1 = makeVisit({ position: 2, title: "Second" });
    const v2 = makeVisit({ position: 1, title: "First" });
    await store.add(v1);
    await store.add(v2);
    const results = await store.getByTrailId("trail-1");
    expect(results[0].title).toBe("First");
    expect(results[1].title).toBe("Second");
  });

  it("update modifies fields and sets updatedAt", async () => {
    const visit = makeVisit();
    await store.add(visit);
    const updated = await store.update(visit.id, { note: "Interesting" });
    expect(updated?.note).toBe("Interesting");
    expect(updated!.updatedAt).not.toBe(visit.updatedAt);
  });

  it("softDelete sets deletedAt and marks pending_sync", async () => {
    const visit = makeVisit();
    await store.add(visit);
    await store.softDelete(visit.id);
    const deleted = await store.getById(visit.id);
    expect(deleted?.deletedAt).not.toBeNull();
    expect(deleted?.syncStatus).toBe(SyncStatus.PendingSync);
  });

  it("getByTrailId excludes soft-deleted visits", async () => {
    const v1 = makeVisit({ position: 1 });
    const v2 = makeVisit({ position: 2 });
    await store.add(v1);
    await store.add(v2);
    await store.softDelete(v1.id);
    const results = await store.getByTrailId("trail-1");
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(v2.id);
  });

  it("getPendingSync returns only pending_sync visits", async () => {
    const v1 = makeVisit();
    await store.add(v1);
    await store.update(v1.id, { syncStatus: SyncStatus.PendingSync });
    const v2 = makeVisit({ position: 2 });
    await store.add(v2);
    const pending = await store.getPendingSync();
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe(v1.id);
  });
});
