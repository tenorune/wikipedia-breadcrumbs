import type { Trail, Visit, ConflictLog } from "../models/index.js";
import type { SyncResult } from "./types.js";

export interface SyncBackend {
  pushTrails(trails: Trail[]): Promise<SyncResult[]>;
  pushVisits(visits: Visit[]): Promise<SyncResult[]>;
  pushConflictLogs(logs: ConflictLog[]): Promise<SyncResult[]>;
  pullTrails(since: string): Promise<Trail[]>;
  pullVisits(since: string): Promise<Visit[]>;
}
