import type { BreadcrumbsDB } from "../db/schema.js";

const HEADER = [
  "trail_id", "trail_name", "trail_status", "trail_created_at", "trail_started_at",
  "trail_start_reason", "trail_note", "trail_is_starred", "trail_tags", "trail_visibility",
  "visit_id", "visit_title", "visit_url", "visit_timestamp", "visit_last_visited_at",
  "visit_position", "visit_note", "visit_source_type", "visit_source_detail",
  "visit_language", "visit_article_id", "visit_parent_visit_id",
].join(",");

function csvEscape(value: unknown): string {
  let str = value == null ? "" : String(value);
  // Prevent formula injection in spreadsheet applications
  if (/^[=+\-@]/.test(str)) {
    str = "'" + str;
  }
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("'")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function exportTrailsCsv(db: BreadcrumbsDB, trailIds?: string[]): Promise<string> {
  let trails;
  if (trailIds) {
    const all = await Promise.all(trailIds.map((id) => db.trails.get(id)));
    trails = all.filter((t) => t && !t.deletedAt);
  } else {
    trails = await db.trails.filter((t) => !t.deletedAt).toArray();
  }

  const rows: string[] = [HEADER];

  for (const trail of trails) {
    if (!trail) continue;
    const visits = await db.visits
      .where("trailId").equals(trail.id)
      .filter((v) => !v.deletedAt)
      .sortBy("position");

    for (const v of visits) {
      rows.push([
        csvEscape(trail.id), csvEscape(trail.name), csvEscape(trail.status),
        csvEscape(trail.createdAt), csvEscape(trail.startedAt),
        csvEscape(trail.startReason), csvEscape(trail.note),
        csvEscape(trail.isStarred), csvEscape(trail.tags.join(";")),
        csvEscape(trail.visibility),
        csvEscape(v.id), csvEscape(v.title), csvEscape(v.url),
        csvEscape(v.timestamp), csvEscape(v.lastVisitedAt),
        csvEscape(v.position), csvEscape(v.note), csvEscape(v.sourceType),
        csvEscape(v.sourceDetail), csvEscape(v.language), csvEscape(v.articleId),
        csvEscape(v.parentVisitId),
      ].join(","));
    }
  }

  return rows.join("\n");
}
