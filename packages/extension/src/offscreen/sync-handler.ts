import {
  BreadcrumbsDB, SyncEngine, SupabaseBackend,
  SyncStatus,
} from "@wikipedia-breadcrumbs/shared";
import type { SyncReport, SyncStateStore } from "@wikipedia-breadcrumbs/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./auth-handler.js";

let supabase: SupabaseClient | null = null;
let engine: SyncEngine | null = null;
let userId: string | null = null;

export function getSyncUserId(): string | null {
  return userId;
}
let lastReport: SyncReport | null = null;

// In-memory state store — offscreen doesn't have chrome.storage access.
// The background reads lastSyncTime from the sync report instead.
let lastSyncTime: string | null = null;

const stateStore: SyncStateStore = {
  async getLastSyncTime() {
    return lastSyncTime;
  },
  async setLastSyncTime(time: string) {
    lastSyncTime = time;
  },
};

async function ensureInitialized(db: BreadcrumbsDB): Promise<boolean> {
  if (engine) return true;

  supabase = getSupabaseClient();

  // Require an authenticated session — don't create anonymous users
  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData?.session?.user) {
    userId = sessionData.session.user.id;
  } else {
    return false;
  }

  // Stamp all local trails with current userId
  // Re-stamps all trails (not just null) in case the anonymous user changed
  const allTrails = await db.trails.toArray();
  const trailsToStamp = allTrails.filter((t) => t.userId !== userId);
  for (const trail of trailsToStamp) {
    await db.trails.update(trail.id, { userId, syncStatus: SyncStatus.PendingSync });
  }

  // Ensure all unsynced visits are marked for push
  const allVisits = await db.visits.filter((v) => v.syncStatus !== SyncStatus.Synced).toArray();
  for (const visit of allVisits) {
    await db.visits.update(visit.id, { syncStatus: SyncStatus.PendingSync });
  }

  const backend = new SupabaseBackend(supabase, userId);
  engine = new SyncEngine(db, backend, stateStore, userId);
  return true;
}

export async function handleSyncMessage(
  db: BreadcrumbsDB,
  type: "enableSync" | "disableSync" | "syncNow" | "getSyncStatus" | "reinitSync"
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  switch (type) {
    case "enableSync": {
      // Reset lastSyncTime on enable to force a full pull
      lastSyncTime = null;
      const ok = await ensureInitialized(db);
      if (!ok) return { success: false, error: "Failed to initialize sync" };
      // Start sync in background, don't block the response
      engine!.syncNow().then((report) => {
        lastReport = report;
        chrome.runtime.sendMessage({ type: "syncComplete", completedAt: report.completedAt });
      }).catch((err) => console.error("[breadcrumbs] enableSync sync error:", err));
      return { success: true, data: { started: true } };
    }
    case "disableSync": {
      // Keep supabase client and session alive — just stop the engine
      // This prevents creating a new anonymous user on re-enable
      engine = null;
      return { success: true };
    }
    case "syncNow": {
      if (!engine) {
        const ok = await ensureInitialized(db);
        if (!ok) return { success: false, error: "Sync not initialized" };
      }
      // Don't block the response — sync runs async
      engine!.syncNow().then((report) => {
        lastReport = report;
        chrome.runtime.sendMessage({ type: "syncComplete", completedAt: report.completedAt });
      }).catch((err) => console.error("[breadcrumbs] Sync error:", err));
      return { success: true, data: { started: true } };
    }
    case "getSyncStatus": {
      const lastSyncTime = await stateStore.getLastSyncTime();
      return { success: true, data: { lastSyncTime, lastReport, isEnabled: !!engine } };
    }
    case "reinitSync": {
      // Tear down existing engine so ensureInitialized re-runs with new session
      engine = null;
      userId = null;
      // Reset lastSyncTime to force a full pull under the new/refreshed account
      lastSyncTime = null;
      const ok = await ensureInitialized(db);
      if (!ok) return { success: false, error: "Failed to reinitialize sync" };
      engine!.syncNow().then((report) => {
        lastReport = report;
        chrome.runtime.sendMessage({ type: "syncComplete", completedAt: report.completedAt });
      });
      return { success: true };
    }
  }
}
