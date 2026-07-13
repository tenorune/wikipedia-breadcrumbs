import type { SupabaseClient } from "@supabase/supabase-js";
import type { Trail, Visit, ConflictLog } from "../models/index.js";
import type { SyncBackend } from "./backend.js";
import type { SyncResult } from "./types.js";
import { mapToRemote, mapToLocal } from "./field-mapper.js";
import { SyncStatus } from "../models/enums.js";

const UPSERT_CHUNK_SIZE = 500;

export class SupabaseBackend implements SyncBackend {
  constructor(private client: SupabaseClient, private userId: string) {}

  async pushTrails(trails: Trail[]): Promise<SyncResult[]> {
    return this.upsertAll("trails", trails.map((t) => mapToRemote(t as any)));
  }

  async pushVisits(visits: Visit[]): Promise<SyncResult[]> {
    return this.upsertAll("visits", visits.map((v) => {
      const remote = mapToRemote(v as any);
      remote.user_id = this.userId;
      return remote;
    }));
  }

  async pushConflictLogs(logs: ConflictLog[]): Promise<SyncResult[]> {
    return this.upsertAll("conflict_logs", logs.map((l) => mapToRemote(l as any)));
  }

  async pullTrails(since: string): Promise<Trail[]> {
    return this.pullTable<Trail>("trails", since);
  }

  async pullVisits(since: string): Promise<Visit[]> {
    return this.pullTable<Visit>("visits", since);
  }

  private async upsertAll(table: string, records: Record<string, unknown>[]): Promise<SyncResult[]> {
    const results: SyncResult[] = [];
    for (let i = 0; i < records.length; i += UPSERT_CHUNK_SIZE) {
      const chunk = records.slice(i, i + UPSERT_CHUNK_SIZE);
      const { error } = await this.client.from(table).upsert(chunk);
      for (const record of chunk) {
        results.push(error
          ? { id: record.id as string, success: false, error: error.message }
          : { id: record.id as string, success: true });
      }
    }
    return results;
  }

  private async pullTable<T>(table: string, since: string): Promise<T[]> {
    const { data, error } = await this.client.from(table).select().gt("updated_at", since);
    if (error || !data) return [];
    return data.map((row: Record<string, unknown>) => {
      const local = mapToLocal(row);
      (local as any).syncStatus = SyncStatus.Synced;
      return local as T;
    });
  }
}
