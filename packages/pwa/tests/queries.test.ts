import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  BreadcrumbsDB, createTrail, createVisit, StartReason, SourceType,
} from "@wikipedia-breadcrumbs/shared";
import { queryTrailData, queryTrailDetail } from "../src/lib/queries";

function makeVisit(trailId: string, position: number, title: string, note: string | null = null) {
  const v = createVisit({
    trailId, url: `https://en.wikipedia.org/wiki/${title}`,
    title, position, sourceType: SourceType.Link,
    language: "en", articleId: title,
  });
  v.note = note;
  return v;
}

describe("queries", () => {
  let db: BreadcrumbsDB;

  beforeEach(async () => {
    db = new BreadcrumbsDB("test-queries-" + crypto.randomUUID());
    await db.open();
  });

  afterEach(async () => { await db.delete(); });

  it("builds summaries newest-startedAt-first with names, counts, lastDiscovered, searchText", async () => {
    const older = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    older.startedAt = "2026-01-01T00:00:00Z";
    const newer = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    newer.startedAt = "2026-02-01T00:00:00Z";
    await db.trails.bulkAdd([older, newer]);
    const v1 = makeVisit(older.id, 1, "Alpha", "my note");
    const v2 = makeVisit(older.id, 2, "Beta");
    v2.timestamp = "2026-01-05T00:00:00Z";
    await db.visits.bulkAdd([v2, v1]); // insertion order must not matter

    const data = await queryTrailData(db);

    expect(data.summaries.map((s) => s.trail.id)).toEqual([newer.id, older.id]);
    const oldSummary = data.summaries[1];
    expect(oldSummary.displayName).toBe("Alpha → Beta");
    expect(oldSummary.visitCount).toBe(2);
    expect(oldSummary.lastDiscovered).toBe("2026-01-05T00:00:00Z");
    expect(oldSummary.searchText).toContain("alpha");
    expect(oldSummary.searchText).toContain("my note");
    const newSummary = data.summaries[0];
    expect(newSummary.displayName).toBe("Empty trail");
    expect(newSummary.lastDiscovered).toBe(newer.startedAt);
  });

  it("uses trail.name when set, single visit title when one visit", async () => {
    const named = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    named.name = "My Trail";
    const single = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    await db.trails.bulkAdd([named, single]);
    await db.visits.add(makeVisit(single.id, 1, "Solo"));

    const { summaries } = await queryTrailData(db);
    const byId = new Map(summaries.map((s) => [s.trail.id, s]));
    expect(byId.get(named.id)?.displayName).toBe("My Trail");
    expect(byId.get(single.id)?.displayName).toBe("Solo");
  });

  it("excludes soft-deleted trails and visits, counts totals", async () => {
    const kept = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    kept.note = "trail note";
    const deleted = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    deleted.deletedAt = "2026-01-01T00:00:00Z";
    await db.trails.bulkAdd([kept, deleted]);
    const liveVisit = makeVisit(kept.id, 1, "Live", "visit note");
    const deadVisit = makeVisit(kept.id, 2, "Dead");
    deadVisit.deletedAt = "2026-01-01T00:00:00Z";
    await db.visits.bulkAdd([liveVisit, deadVisit]);

    const data = await queryTrailData(db);
    expect(data.summaries).toHaveLength(1);
    expect(data.summaries[0].visitCount).toBe(1);
    expect(data.totalVisits).toBe(1);
    expect(data.totalNotes).toBe(2); // trail note + visit note
  });

  it("queryTrailDetail returns position-sorted visits and merge candidates excluding self", async () => {
    const me = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    const other = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    await db.trails.bulkAdd([me, other]);
    await db.visits.bulkAdd([
      makeVisit(me.id, 2, "Second"),
      makeVisit(me.id, 1, "First"),
      makeVisit(other.id, 1, "Elsewhere"),
    ]);

    const detail = await queryTrailDetail(db, me.id);
    expect(detail.trail?.id).toBe(me.id);
    expect(detail.visits.map((v) => v.title)).toEqual(["First", "Second"]);
    expect(detail.mergeCandidates).toEqual([{ id: other.id, displayName: "Elsewhere" }]);
  });
});
