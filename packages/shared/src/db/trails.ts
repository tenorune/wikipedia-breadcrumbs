import type { BreadcrumbsDB } from "./schema.js";
import type { Trail } from "../models/trail.js";
import { TrailStatus, SyncStatus } from "../models/enums.js";

export function trailStore(db: BreadcrumbsDB) {
  return {
    async add(trail: Trail): Promise<Trail> {
      await db.trails.add(trail);
      return trail;
    },
    async getById(id: string): Promise<Trail | undefined> {
      return db.trails.get(id);
    },
    async getAll(): Promise<Trail[]> {
      const trails = await db.trails.filter((t) => t.deletedAt === null).sortBy("startedAt");
      return trails.reverse();
    },
    async getActive(): Promise<Trail[]> {
      return db.trails.where("status").equals(TrailStatus.Active).filter((t) => t.deletedAt === null).toArray();
    },
    async getByDeviceId(deviceId: string): Promise<Trail[]> {
      return db.trails.where("deviceId").equals(deviceId).filter((t) => t.deletedAt === null).toArray();
    },
    async update(id: string, changes: Partial<Omit<Trail, "id">>): Promise<Trail | undefined> {
      const updatedAt = new Date().toISOString();
      // If caller explicitly sets syncStatus, respect it (e.g. sync engine marking as synced)
      // Otherwise, auto-mark synced records as pending_sync since they were modified
      let syncStatus = (changes as any).syncStatus;
      if (syncStatus === undefined) {
        const current = await db.trails.get(id);
        syncStatus = current?.syncStatus === SyncStatus.Synced
          ? SyncStatus.PendingSync : current?.syncStatus;
      }
      await db.trails.update(id, { ...changes, updatedAt, syncStatus });
      return db.trails.get(id);
    },
    async finalize(id: string): Promise<Trail | undefined> {
      const now = new Date().toISOString();
      await db.trails.update(id, { status: TrailStatus.Finalized, endedAt: now, updatedAt: now, syncStatus: SyncStatus.PendingSync });
      return db.trails.get(id);
    },
    async softDelete(id: string): Promise<void> {
      const now = new Date().toISOString();
      await db.trails.update(id, { deletedAt: now, updatedAt: now, syncStatus: SyncStatus.PendingSync });
    },
    async getPendingSync(): Promise<Trail[]> {
      return db.trails.where("syncStatus").equals(SyncStatus.PendingSync).toArray();
    },
  };
}
