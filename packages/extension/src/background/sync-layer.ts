import { SyncEngine, SupabaseBackend, SyncStatus, restampForUser } from "@wikipedia-breadcrumbs/shared";
import type { SyncReport, SyncStateStore } from "@wikipedia-breadcrumbs/shared";
import { getSupabaseClient, ensureSessionRecovered } from "./auth-layer.js";
import { db, setSyncUserId } from "./data-layer.js";

let engine: SyncEngine | null = null;
let userId: string | null = null;
let lastReport: SyncReport | null = null;
let lastSyncTime: string | null = null;

const stateStore: SyncStateStore = {
  async getLastSyncTime() { return lastSyncTime; },
  async setLastSyncTime(time: string) { lastSyncTime = time; },
};

async function ensureInitialized(): Promise<boolean> {
  if (engine) return true;

  await ensureSessionRecovered();
  const supabase = getSupabaseClient();
  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData?.session?.user) {
    userId = sessionData.session.user.id;
  } else {
    return false;
  }

  setSyncUserId(userId);

  // Stamp local records for the current user (bulk; does not touch updatedAt)
  await restampForUser(db, userId, { includeSyncedVisits: false });

  const backend = new SupabaseBackend(supabase, userId);
  engine = new SyncEngine(db, backend, stateStore, userId);
  return true;
}

function runSync(): void {
  engine!.syncNow().then((report) => {
    lastReport = report;
    chrome.storage.local.set({ lastSyncTime: report.completedAt });
  }).catch((err) => console.error("[breadcrumbs] Sync error:", err));
}

export async function enableSync() {
  lastSyncTime = null; // force a full pull on enable
  const ok = await ensureInitialized();
  if (!ok) return { success: false as const, error: "Failed to initialize sync" };
  runSync();
  return { success: true as const, data: { started: true } };
}

export async function disableSync() {
  // Keep the client/session alive; just stop the engine so re-enable doesn't
  // create a new anonymous user.
  engine = null;
  return { success: true as const };
}

export async function syncNow() {
  if (!engine) {
    const ok = await ensureInitialized();
    if (!ok) return { success: false as const, error: "Sync not initialized" };
  }
  runSync();
  return { success: true as const, data: { started: true } };
}

export async function getSyncStatus() {
  const lst = await stateStore.getLastSyncTime();
  return { success: true as const, data: { lastSyncTime: lst, lastReport, isEnabled: !!engine } };
}

export async function reinitSync() {
  engine = null;
  userId = null;
  setSyncUserId(null);
  lastSyncTime = null;
  const ok = await ensureInitialized();
  if (!ok) return { success: false as const, error: "Failed to reinitialize sync" };
  runSync();
  return { success: true as const };
}
