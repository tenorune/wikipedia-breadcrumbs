import {
  BreadcrumbsDB, SyncEngine, SupabaseBackend, createSupabaseClient,
  SyncStatus, trailStore,
} from "@wikipedia-breadcrumbs/shared";
import type { SyncReport, SyncStateStore } from "@wikipedia-breadcrumbs/shared";
import type { SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

let supabase: SupabaseClient | null = null;
let engine: SyncEngine | null = null;
let userId: string | null = null;
let lastReport: SyncReport | null = null;

const stateStore: SyncStateStore = {
  async getLastSyncTime() {
    const { lastSyncTime } = await chrome.storage.local.get("lastSyncTime");
    return (lastSyncTime as string) ?? null;
  },
  async setLastSyncTime(time: string) {
    await chrome.storage.local.set({ lastSyncTime: time });
  },
};

async function ensureInitialized(db: BreadcrumbsDB): Promise<boolean> {
  if (engine) return true;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error("[breadcrumbs] Missing Supabase env vars");
    return false;
  }

  supabase = createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const { data: authData, error: authError } = await supabase.auth.signInAnonymously();
  if (authError || !authData.user) {
    console.error("[breadcrumbs] Anonymous auth failed:", authError);
    return false;
  }
  userId = authData.user.id;

  // Stamp all local trails with userId
  const trails = trailStore(db);
  const allTrails = await db.trails.filter((t) => !t.userId).toArray();
  for (const trail of allTrails) {
    await trails.update(trail.id, { userId, syncStatus: SyncStatus.PendingSync } as any);
  }

  const backend = new SupabaseBackend(supabase, userId);
  engine = new SyncEngine(db, backend, stateStore, userId);
  return true;
}

export async function handleSyncMessage(
  db: BreadcrumbsDB,
  type: "enableSync" | "disableSync" | "syncNow" | "getSyncStatus"
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  switch (type) {
    case "enableSync": {
      const ok = await ensureInitialized(db);
      if (!ok) return { success: false, error: "Failed to initialize sync" };
      const report = await engine!.syncNow();
      lastReport = report;
      return { success: true, data: report };
    }
    case "disableSync": {
      engine = null;
      supabase = null;
      userId = null;
      return { success: true };
    }
    case "syncNow": {
      if (!engine) {
        const ok = await ensureInitialized(db);
        if (!ok) return { success: false, error: "Sync not initialized" };
      }
      const report = await engine!.syncNow();
      lastReport = report;
      return { success: true, data: report };
    }
    case "getSyncStatus": {
      const lastSyncTime = await stateStore.getLastSyncTime();
      return { success: true, data: { lastSyncTime, lastReport, isEnabled: !!engine } };
    }
  }
}
