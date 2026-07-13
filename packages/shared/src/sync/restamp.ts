import type { BreadcrumbsDB } from "../db/schema.js";
import { SyncStatus } from "../models/enums.js";

/**
 * Bulk re-stamp local records for a (new) sync user. Used when enabling sync
 * and when upgrading an anonymous account. Deliberately does NOT touch
 * updatedAt: ownership/sync-state changes are not content edits.
 */
export async function restampForUser(
  db: BreadcrumbsDB,
  userId: string,
  opts: { includeSyncedVisits: boolean }
): Promise<void> {
  await db.trails
    .filter((t) => t.userId !== userId)
    .modify({ userId, syncStatus: SyncStatus.PendingSync });

  if (opts.includeSyncedVisits) {
    await db.visits.toCollection().modify({ syncStatus: SyncStatus.PendingSync });
  } else {
    await db.visits
      .filter((v) => v.syncStatus !== SyncStatus.Synced)
      .modify({ syncStatus: SyncStatus.PendingSync });
  }
}
