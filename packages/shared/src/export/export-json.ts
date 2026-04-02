import type { BreadcrumbsDB } from "../db/schema.js";
import type { ExportData, ExportTrail, ExportVisit } from "./types.js";

export async function exportTrailsJson(db: BreadcrumbsDB, trailIds?: string[]): Promise<string> {
  let trails;
  if (trailIds) {
    const all = await Promise.all(trailIds.map((id) => db.trails.get(id)));
    trails = all.filter((t) => t && !t.deletedAt);
  } else {
    trails = await db.trails.filter((t) => !t.deletedAt).toArray();
  }

  const exportTrails: ExportTrail[] = [];
  for (const trail of trails) {
    if (!trail) continue;
    const visits = await db.visits
      .where("trailId").equals(trail.id)
      .filter((v) => !v.deletedAt)
      .sortBy("position");

    exportTrails.push({
      id: trail.id,
      name: trail.name,
      createdAt: trail.createdAt,
      startedAt: trail.startedAt,
      endedAt: trail.endedAt,
      updatedAt: trail.updatedAt,
      status: trail.status,
      isStarred: trail.isStarred,
      tags: trail.tags,
      note: trail.note,
      visibility: trail.visibility,
      forkedFromVisitId: trail.forkedFromVisitId,
      startReason: trail.startReason,
      visits: visits.map((v): ExportVisit => ({
        id: v.id,
        url: v.url,
        title: v.title,
        timestamp: v.timestamp,
        lastVisitedAt: v.lastVisitedAt,
        updatedAt: v.updatedAt,
        position: v.position,
        sourceType: v.sourceType,
        sourceDetail: v.sourceDetail,
        note: v.note,
        summary: v.summary,
        thumbnailUrl: v.thumbnailUrl,
        language: v.language,
        articleId: v.articleId,
        parentVisitId: v.parentVisitId,
      })),
    });
  }

  const data: ExportData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    trails: exportTrails,
  };

  return JSON.stringify(data, null, 2);
}
