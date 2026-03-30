import type { BreadcrumbsDB } from "../db/schema.js";
import { createTrail } from "../models/trail.js";
import { StartReason, SyncStatus } from "../models/enums.js";

export async function splitTrail(db: BreadcrumbsDB, trailId: string, atPosition: number): Promise<[originalId: string, newId: string]> {
  return db.transaction("rw", db.trails, db.visits, async () => {
    const trail = await db.trails.get(trailId);
    if (!trail) throw new Error(`Trail not found: ${trailId}`);

    const allVisits = await db.visits.where("trailId").equals(trailId).filter((v) => v.deletedAt === null).sortBy("position");
    const move = allVisits.filter((v) => v.position > atPosition);
    if (move.length === 0) throw new Error("Nothing to split: no visits after the split point");

    const newTrail = createTrail({ startReason: StartReason.Manual, deviceId: trail.deviceId, userId: trail.userId, tags: [...trail.tags] });
    await db.trails.add(newTrail);

    const now = new Date().toISOString();
    for (let i = 0; i < move.length; i++) {
      await db.visits.update(move[i].id, { trailId: newTrail.id, position: i + 1, syncStatus: SyncStatus.PendingSync, updatedAt: now });
    }
    await db.trails.update(trailId, { updatedAt: now, syncStatus: SyncStatus.PendingSync });
    return [trailId, newTrail.id];
  });
}

export async function mergeTrails(db: BreadcrumbsDB, primaryId: string, secondaryId: string): Promise<string> {
  return db.transaction("rw", db.trails, db.visits, async () => {
    const primary = await db.trails.get(primaryId);
    const secondary = await db.trails.get(secondaryId);
    if (!primary) throw new Error(`Trail not found: ${primaryId}`);
    if (!secondary) throw new Error(`Trail not found: ${secondaryId}`);

    const primaryVisits = await db.visits.where("trailId").equals(primaryId).filter((v) => v.deletedAt === null).toArray();
    const secondaryVisits = await db.visits.where("trailId").equals(secondaryId).filter((v) => v.deletedAt === null).toArray();
    const allVisits = [...primaryVisits, ...secondaryVisits].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    const now = new Date().toISOString();
    for (let i = 0; i < allVisits.length; i++) {
      await db.visits.update(allVisits[i].id, { trailId: primaryId, position: i + 1, syncStatus: SyncStatus.PendingSync, updatedAt: now });
    }
    await db.trails.update(secondaryId, { deletedAt: now, updatedAt: now, syncStatus: SyncStatus.PendingSync });
    await db.trails.update(primaryId, { updatedAt: now, syncStatus: SyncStatus.PendingSync });
    return primaryId;
  });
}
