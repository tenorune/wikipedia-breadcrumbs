import type { BreadcrumbsDB } from "./schema.js";
import type { Visit } from "../models/visit.js";
import { SyncStatus } from "../models/enums.js";

export function visitStore(db: BreadcrumbsDB) {
  return {
    async add(visit: Visit): Promise<Visit> {
      await db.visits.add(visit);
      return visit;
    },
    async getById(id: string): Promise<Visit | undefined> {
      return db.visits.get(id);
    },
    async getByTrailId(trailId: string): Promise<Visit[]> {
      return db.visits
        .where("trailId").equals(trailId)
        .filter((v) => v.deletedAt === null)
        .sortBy("position");
    },
    async update(id: string, changes: Partial<Omit<Visit, "id">>): Promise<Visit | undefined> {
      const updatedAt = new Date().toISOString();
      await db.visits.update(id, { ...changes, updatedAt });
      return db.visits.get(id);
    },
    async softDelete(id: string): Promise<void> {
      const now = new Date().toISOString();
      await db.visits.update(id, { deletedAt: now, updatedAt: now, syncStatus: SyncStatus.PendingSync });
    },
    async getPendingSync(): Promise<Visit[]> {
      return db.visits.where("syncStatus").equals(SyncStatus.PendingSync).toArray();
    },
  };
}
