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

  // Try to restore existing session first
  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData?.session?.user) {
    userId = sessionData.session.user.id;
    console.log("[breadcrumbs] Restored existing session:", userId);
  } else {
    // No existing session — create anonymous user
    const { data: authData, error: authError } = await supabase.auth.signInAnonymously();
    if (authError || !authData.user) {
      console.error("[breadcrumbs] Anonymous auth failed:", authError);
      return false;
    }
    userId = authData.user.id;
    console.log("[breadcrumbs] Created anonymous user:", userId);
  }

  // Stamp all local trails with current userId
  // Re-stamps all trails (not just null) in case the anonymous user changed
  const allTrails = await db.trails.toArray();
  const trailsToStamp = allTrails.filter((t) => t.userId !== userId);
  console.log(`[breadcrumbs] Stamping ${trailsToStamp.length} trails with userId ${userId}`);
  for (const trail of trailsToStamp) {
    await db.trails.update(trail.id, { userId, syncStatus: SyncStatus.PendingSync });
  }

  // Ensure all unsynced visits are marked for push
  const allVisits = await db.visits.filter((v) => v.syncStatus !== SyncStatus.Synced).toArray();
  console.log(`[breadcrumbs] Marking ${allVisits.length} visits as pending_sync`);
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
      const ok = await ensureInitialized(db);
      if (!ok) return { success: false, error: "Failed to initialize sync" };
      // Start sync in background, don't block the response
      engine!.syncNow().then((report) => {
        lastReport = report;
        console.log("[breadcrumbs] enableSync sync complete:", JSON.stringify(report));
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
      console.log("[breadcrumbs] Starting sync...");
      // Don't block the response — sync runs async
      engine!.syncNow().then((report) => {
        lastReport = report;
        console.log("[breadcrumbs] Sync complete:", JSON.stringify(report));
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
