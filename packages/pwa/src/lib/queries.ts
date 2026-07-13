import type { BreadcrumbsDB, Trail, Visit } from "@wikipedia-breadcrumbs/shared";

export interface TrailSummary {
  trail: Trail;
  displayName: string;
  visitCount: number;
  lastDiscovered: string; // timestamp of last visit, or trail.startedAt
  searchText: string;
}

export interface TrailData {
  summaries: TrailSummary[]; // newest startedAt first (parity with trailStore.getAll)
  totalVisits: number;
  totalNotes: number;
}

export interface TrailDetailData {
  trail: Trail | null;
  visits: Visit[]; // position order
  mergeCandidates: Array<{ id: string; displayName: string }>;
}

function displayNameFor(trail: Trail, visits: Visit[]): string {
  if (trail.name) return trail.name;
  if (visits.length === 0) return "Empty trail";
  if (visits.length === 1) return visits[0].title;
  return `${visits[0].title} → ${visits[visits.length - 1].title}`;
}

/**
 * Two whole-table reads + in-memory grouping instead of one visit query per
 * trail. Inside a liveQuery querier, both table reads are tracked, so any
 * trail or visit write re-runs the query.
 */
export async function queryTrailData(db: BreadcrumbsDB): Promise<TrailData> {
  const [trails, visits] = await Promise.all([
    db.trails.filter((t) => t.deletedAt === null).sortBy("startedAt"),
    db.visits.filter((v) => v.deletedAt === null).toArray(),
  ]);
  trails.reverse();

  const byTrail = new Map<string, Visit[]>();
  for (const v of visits) {
    const list = byTrail.get(v.trailId);
    if (list) list.push(v);
    else byTrail.set(v.trailId, [v]);
  }
  for (const list of byTrail.values()) list.sort((a, b) => a.position - b.position);

  const summaries = trails.map((trail) => {
    const tv = byTrail.get(trail.id) ?? [];
    const parts = [trail.name ?? "", trail.note ?? ""];
    for (const v of tv) parts.push(v.title, v.note ?? "");
    return {
      trail,
      displayName: displayNameFor(trail, tv),
      visitCount: tv.length,
      lastDiscovered: tv.length > 0 ? tv[tv.length - 1].timestamp : trail.startedAt,
      searchText: parts.join(" ").toLowerCase(),
    };
  });

  const totalNotes =
    trails.filter((t) => t.note).length + visits.filter((v) => v.note).length;
  return { summaries, totalVisits: visits.length, totalNotes };
}

export async function queryTrailDetail(
  db: BreadcrumbsDB,
  trailId: string
): Promise<TrailDetailData> {
  const [{ summaries }, trail, visits] = await Promise.all([
    queryTrailData(db),
    db.trails.get(trailId),
    db.visits.where("trailId").equals(trailId).filter((v) => v.deletedAt === null).sortBy("position"),
  ]);
  return {
    trail: trail ?? null,
    visits,
    mergeCandidates: summaries
      .filter((s) => s.trail.id !== trailId)
      .map((s) => ({ id: s.trail.id, displayName: s.displayName })),
  };
}
