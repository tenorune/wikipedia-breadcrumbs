import type { BreadcrumbsDB } from "../db/schema.js";
import { visitStore } from "../db/visits.js";
import { trailStore } from "../db/trails.js";
import type { Trail, Visit, ConflictLog } from "../models/index.js";
import { SyncStatus } from "../models/enums.js";
import type { SyncBackend } from "./backend.js";
import type { SyncReport, SyncResult, SyncStateStore } from "./types.js";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export class SyncEngine {
  private syncing = false;

  constructor(
    private db: BreadcrumbsDB,
    private backend: SyncBackend,
    private stateStore: SyncStateStore,
    private userId: string
  ) {}

  async syncNow(): Promise<SyncReport> {
    if (this.syncing) {
      return {
        pushed: { trails: 0, visits: 0, conflictLogs: 0 },
        pulled: { trails: 0, visits: 0 },
        conflicts: 0,
        errors: ["Sync already in progress"],
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };
    }

    this.syncing = true;
    const startedAt = new Date().toISOString();
    const report: SyncReport = {
      pushed: { trails: 0, visits: 0, conflictLogs: 0 },
      pulled: { trails: 0, visits: 0 },
      conflicts: 0, errors: [], startedAt, completedAt: "",
    };

    try {
      await this.push(report);
      await this.pull(report);
      await this.cleanupOldDeleted();
      // Only update lastSyncTime if the sync had no errors and we're online
      const isOnline = typeof navigator !== "undefined" ? navigator.onLine : true;
      if (report.errors.length === 0 && isOnline) {
        await this.stateStore.setLastSyncTime(new Date().toISOString());
      }
    } catch (err) {
      report.errors.push(String(err));
    } finally {
      report.completedAt = new Date().toISOString();
      this.syncing = false;
    }
    return report;
  }

  private async push(report: SyncReport): Promise<void> {
    const pendingTrails = await this.db.trails
      .where("syncStatus").anyOf([SyncStatus.PendingSync, SyncStatus.LocalOnly]).toArray();
    if (pendingTrails.length > 0) {
      const results = await this.backend.pushTrails(pendingTrails);
      report.pushed.trails += await this.markSynced(this.db.trails, results, "Trail", report);
    }

    const pendingVisits = await this.db.visits
      .where("syncStatus").anyOf([SyncStatus.PendingSync, SyncStatus.LocalOnly]).toArray();
    if (pendingVisits.length > 0) {
      const results = await this.backend.pushVisits(pendingVisits);
      report.pushed.visits += await this.markSynced(this.db.visits, results, "Visit", report);
    }

    const pendingConflicts = await this.db.conflictLogs.filter((c) => !c.resolvedAt).toArray();
    if (pendingConflicts.length > 0) {
      const results = await this.backend.pushConflictLogs(pendingConflicts);
      report.pushed.conflictLogs = results.filter((r) => r.success).length;
    }
  }

  private async markSynced(
    table: { where(index: string): { anyOf(keys: string[]): { modify(changes: object): Promise<number> } } },
    results: SyncResult[],
    label: "Trail" | "Visit",
    report: SyncReport
  ): Promise<number> {
    const okIds = results.filter((r) => r.success).map((r) => r.id);
    if (okIds.length > 0) {
      await table.where("id").anyOf(okIds).modify({ syncStatus: SyncStatus.Synced });
    }
    for (const r of results) {
      if (!r.success) report.errors.push(`${label} push failed ${r.id}: ${r.error}`);
    }
    return okIds.length;
  }

  private async pull(report: SyncReport): Promise<void> {
    const trails = trailStore(this.db);
    const visits = visitStore(this.db);
    const lastSync = (await this.stateStore.getLastSyncTime()) ?? "1970-01-01T00:00:00Z";

    const remoteTrails = await this.backend.pullTrails(lastSync);
    for (const remote of remoteTrails) {
      await this.mergeRecord(remote, this.db.trails, trails, "trail", report);
      report.pulled.trails++;
    }

    const remoteVisits = await this.backend.pullVisits(lastSync);
    for (const remote of remoteVisits) {
      await this.mergeRecord(remote, this.db.visits, visits, "visit", report);
      report.pulled.visits++;
    }
  }

  private async mergeRecord<T extends { id: string; updatedAt: string; syncStatus: string }>(
    remote: T,
    table: { get(id: string): Promise<T | undefined> },
    store: { update(id: string, changes: any): Promise<any> },
    recordType: "trail" | "visit",
    report: SyncReport
  ): Promise<void> {
    const local = await table.get(remote.id);

    if (!local) {
      await this.db.table(recordType === "trail" ? "trails" : "visits").add(remote);
      return;
    }

    if (local.updatedAt >= remote.updatedAt) return;

    if (local.syncStatus === SyncStatus.PendingSync || local.syncStatus === SyncStatus.LocalOnly) {
      const conflict: ConflictLog = {
        id: crypto.randomUUID(),
        userId: this.userId,
        recordType,
        recordId: remote.id,
        losingSnapshot: { ...local } as any,
        winningSnapshot: { ...remote } as any,
        resolvedAt: null,
        createdAt: new Date().toISOString(),
      };
      await this.db.conflictLogs.add(conflict);
      report.conflicts++;
    }

    const { id, ...changes } = remote as any;
    await store.update(remote.id, changes);
  }

  private async cleanupOldDeleted(): Promise<void> {
    const cutoff = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();
    const oldTrails = await this.db.trails.where("deletedAt").below(cutoff).toArray();
    for (const t of oldTrails) { if (t.deletedAt) await this.db.trails.delete(t.id); }
    const oldVisits = await this.db.visits.where("deletedAt").below(cutoff).toArray();
    for (const v of oldVisits) { if (v.deletedAt) await this.db.visits.delete(v.id); }
  }
}
