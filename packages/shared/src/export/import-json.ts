import type { BreadcrumbsDB } from "../db/schema.js";
import type { ExportTrail, ExportVisit, ConflictItem, ImportPlan, ImportContext, ImportResult } from "./types.js";
import { SyncStatus, TrailStatus, Visibility, StartReason, SourceType } from "../models/enums.js";

const CURRENT_VERSION = 1;

const VALID_STATUS = new Set(Object.values(TrailStatus));
const VALID_VISIBILITY = new Set(Object.values(Visibility));
const VALID_START_REASON = new Set(Object.values(StartReason));
const VALID_SOURCE_TYPE = new Set(Object.values(SourceType));

const MAX_LENGTHS = { url: 2048, title: 500, note: 10000, name: 500, sourceDetail: 500 , tags: 20 };

export function parseImportJson(jsonString: string): { trails: ExportTrail[]; errors: string[] } {
  let data: any;
  try {
    data = JSON.parse(jsonString);
  } catch {
    return { trails: [], errors: ["Invalid JSON file."] };
  }

  if (!data || typeof data !== "object") {
    return { trails: [], errors: ["File does not contain valid export data."] };
  }

  if (typeof data.version !== "number") {
    return { trails: [], errors: ["Missing version field."] };
  }
  if (data.version > CURRENT_VERSION) {
    return { trails: [], errors: [`This file requires a newer version of the app (v${data.version}). Please update the app to import this file.`] };
  }

  if (!Array.isArray(data.trails)) {
    return { trails: [], errors: ["Missing trails array."] };
  }

  const errors: string[] = [];
  const trails: ExportTrail[] = [];

  for (let i = 0; i < data.trails.length; i++) {
    const t = data.trails[i];
    const prefix = `Trail ${i + 1}`;

    if (!t.id || typeof t.id !== "string") { errors.push(`${prefix}: missing or invalid id`); continue; }
    if (typeof t.startedAt !== "string") { errors.push(`${prefix}: missing startedAt`); continue; }
    if (typeof t.createdAt !== "string") { errors.push(`${prefix}: missing createdAt`); continue; }
    if (typeof t.updatedAt !== "string") { errors.push(`${prefix}: missing updatedAt`); continue; }
    if (!VALID_STATUS.has(t.status)) { errors.push(`${prefix}: invalid status "${t.status}"`); continue; }
    if (!VALID_VISIBILITY.has(t.visibility)) { errors.push(`${prefix}: invalid visibility "${t.visibility}"`); continue; }
    if (!VALID_START_REASON.has(t.startReason)) { errors.push(`${prefix}: invalid startReason "${t.startReason}"`); continue; }
    if (!Array.isArray(t.visits)) { errors.push(`${prefix}: missing visits array`); continue; }
    if (t.name && typeof t.name === "string" && t.name.length > MAX_LENGTHS.name) { errors.push(`${prefix}: name too long`); continue; }
    if (t.note && typeof t.note === "string" && t.note.length > MAX_LENGTHS.note) { errors.push(`${prefix}: note too long`); continue; }
    if (Array.isArray(t.tags) && t.tags.length > MAX_LENGTHS.tags) { errors.push(`${prefix}: too many tags`); continue; }

    const visits: ExportVisit[] = [];
    let visitErrors = false;
    for (let j = 0; j < t.visits.length; j++) {
      const v = t.visits[j];
      const vPrefix = `${prefix}, Visit ${j + 1}`;
      if (!v.id || typeof v.id !== "string") { errors.push(`${vPrefix}: missing id`); visitErrors = true; continue; }
      if (!v.url || typeof v.url !== "string" || v.url.length > MAX_LENGTHS.url) { errors.push(`${vPrefix}: missing or invalid url`); visitErrors = true; continue; }
      if (typeof v.title !== "string" || v.title.length > MAX_LENGTHS.title) { errors.push(`${vPrefix}: missing or invalid title`); visitErrors = true; continue; }
      if (typeof v.position !== "number" || v.position < 0) { errors.push(`${vPrefix}: invalid position`); visitErrors = true; continue; }
      if (!VALID_SOURCE_TYPE.has(v.sourceType)) { errors.push(`${vPrefix}: invalid sourceType "${v.sourceType}"`); visitErrors = true; continue; }
      if (v.note && typeof v.note === "string" && v.note.length > MAX_LENGTHS.note) { errors.push(`${vPrefix}: note too long`); visitErrors = true; continue; }
      if (v.sourceDetail && typeof v.sourceDetail === "string" && v.sourceDetail.length > MAX_LENGTHS.sourceDetail) { errors.push(`${vPrefix}: sourceDetail too long`); visitErrors = true; continue; }
      visits.push(v as ExportVisit);
    }

    if (!visitErrors) {
      trails.push({ ...t, visits } as ExportTrail);
    }
  }

  return { trails, errors };
}

export async function detectConflicts(
  db: BreadcrumbsDB,
  trails: ExportTrail[]
): Promise<{ clean: ExportTrail[]; conflicts: ConflictItem[] }> {
  const clean: ExportTrail[] = [];
  const conflicts: ConflictItem[] = [];

  for (const imported of trails) {
    const local = await db.trails.get(imported.id);
    if (local && !local.deletedAt) {
      conflicts.push({ imported, local });
    } else {
      clean.push(imported);
    }
  }

  return { clean, conflicts };
}

export async function executeImport(
  db: BreadcrumbsDB,
  plan: ImportPlan,
  context: ImportContext
): Promise<ImportResult> {
  const result: ImportResult = { trailsImported: 0, visitsImported: 0, skipped: 0, errors: [] };

  for (const item of plan.items) {
    if (item.action === "skip") {
      result.skipped++;
      continue;
    }

    try {
      if (item.action === "overwrite") {
        await importOverwrite(db, item.trail, context);
      } else {
        await importCopy(db, item.trail, context);
      }
      result.trailsImported++;
      result.visitsImported += item.trail.visits.length;
    } catch (err) {
      result.errors.push(`Failed to import "${item.trail.name ?? item.trail.id}": ${err}`);
    }
  }

  return result;
}

async function importOverwrite(db: BreadcrumbsDB, trail: ExportTrail, ctx: ImportContext): Promise<void> {
  await db.transaction("rw", db.trails, db.visits, async () => {
    // Soft-delete existing visits for this trail
    const existing = await db.visits.where("trailId").equals(trail.id).toArray();
    const now = new Date().toISOString();
    for (const v of existing) {
      await db.visits.update(v.id, { deletedAt: now });
    }

    // Upsert trail
    await db.trails.put(buildTrailRecord(trail, ctx));

    // Insert visits
    for (const v of trail.visits) {
      await db.visits.put(buildVisitRecord(v, trail.id, ctx));
    }
  });
}

async function importCopy(db: BreadcrumbsDB, trail: ExportTrail, ctx: ImportContext): Promise<void> {
  const newTrailId = crypto.randomUUID();
  const visitIdMap = new Map<string, string>();

  // Pre-generate new visit IDs
  for (const v of trail.visits) {
    visitIdMap.set(v.id, crypto.randomUUID());
  }

  await db.transaction("rw", db.trails, db.visits, async () => {
    const trailRecord = buildTrailRecord(trail, ctx);
    trailRecord.id = newTrailId;
    // Remap forkedFromVisitId if it points to a visit in this export
    if (trailRecord.forkedFromVisitId && visitIdMap.has(trailRecord.forkedFromVisitId)) {
      trailRecord.forkedFromVisitId = visitIdMap.get(trailRecord.forkedFromVisitId)!;
    }
    await db.trails.add(trailRecord);

    for (const v of trail.visits) {
      const record = buildVisitRecord(v, newTrailId, ctx);
      record.id = visitIdMap.get(v.id)!;
      if (record.parentVisitId && visitIdMap.has(record.parentVisitId)) {
        record.parentVisitId = visitIdMap.get(record.parentVisitId)!;
      }
      await db.visits.add(record);
    }
  });
}

function buildTrailRecord(trail: ExportTrail, ctx: ImportContext): any {
  return JSON.parse(JSON.stringify({
    id: trail.id,
    userId: ctx.userId,
    name: trail.name,
    createdAt: trail.createdAt,
    startedAt: trail.startedAt,
    endedAt: trail.endedAt,
    updatedAt: trail.updatedAt,
    status: trail.status,
    isStarred: trail.isStarred,
    tags: trail.tags ?? [],
    note: trail.note,
    visibility: trail.visibility,
    deviceId: ctx.deviceId,
    forkedFromVisitId: trail.forkedFromVisitId,
    startReason: trail.startReason,
    syncStatus: SyncStatus.LocalOnly,
    deletedAt: null,
  }));
}

function buildVisitRecord(v: ExportVisit, trailId: string, ctx: ImportContext): any {
  return JSON.parse(JSON.stringify({
    id: v.id,
    trailId,
    url: v.url,
    title: v.title,
    timestamp: v.timestamp,
    lastVisitedAt: v.lastVisitedAt,
    updatedAt: v.updatedAt,
    position: v.position,
    sourceType: v.sourceType,
    sourceDetail: v.sourceDetail,
    tabId: null,
    windowId: null,
    note: v.note,
    summary: v.summary,
    thumbnailUrl: v.thumbnailUrl,
    language: v.language,
    articleId: v.articleId,
    parentVisitId: v.parentVisitId,
    syncStatus: SyncStatus.LocalOnly,
    deletedAt: null,
  }));
}
