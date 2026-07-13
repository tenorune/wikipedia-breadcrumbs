import {
  SyncEngine, SupabaseBackend, SyncStatus, restampForUser,
} from "@wikipedia-breadcrumbs/shared";
import type { SyncStateStore, SyncReport } from "@wikipedia-breadcrumbs/shared";
import { supabase } from "$lib/supabase";
import { db } from "$lib/stores/db";

let engine: SyncEngine | null = null;
let userId: string | null = null;

let _syncEnabled = $state(false);
let _lastSyncTime = $state<string | null>(typeof localStorage !== 'undefined' ? localStorage.getItem("lastSyncTime") : null);
let _syncing = $state(false);
let _lastReport = $state<SyncReport | null>(null);
let _syncError = $state<string | null>(null);

export const syncState = {
  get syncEnabled() { return _syncEnabled; },
  get lastSyncTime() { return _lastSyncTime; },
  get syncing() { return _syncing; },
  get lastReport() { return _lastReport; },
  get syncError() { return _syncError; },
};

const stateStore: SyncStateStore = {
  async getLastSyncTime() {
    return localStorage.getItem("lastSyncTime");
  },
  async setLastSyncTime(time: string) {
    localStorage.setItem("lastSyncTime", time);
    _lastSyncTime = time;
  },
};

export async function enableSync(): Promise<void> {
  if (engine) return;

  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData?.session?.user) {
    userId = sessionData.session.user.id;
  } else {
    // No session — require sign-in, don't create anonymous user
    return;
  }

  await restampForUser(db, userId, { includeSyncedVisits: false });

  const backend = new SupabaseBackend(supabase, userId);
  engine = new SyncEngine(db, backend, stateStore, userId);
  _syncEnabled = true;
  localStorage.setItem("syncEnabled", "true");
}

export function disableSync(): void {
  engine = null;
  _syncEnabled = false;
  localStorage.removeItem("syncEnabled");
}

export async function syncNow(): Promise<void> {
  if (!engine) return;
  if (_syncing) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  _syncing = true;
  _syncError = null;
  try {
    const report = await engine.syncNow();
    _lastReport = report;
    if (report.errors.length > 0) {
      const n = report.errors.length;
      _syncError = `${n} record${n === 1 ? "" : "s"} failed to sync`;
    }
  } catch (err) {
    console.error("[pwa] Sync error:", err);
    _syncError = err instanceof Error ? err.message : String(err);
  } finally {
    _syncing = false;
  }
}

export async function upgradeToAuthenticatedUser(newUserId: string): Promise<void> {
  await restampForUser(db, newUserId, { includeSyncedVisits: true });

  // Reset lastSyncTime to force a full pull under the new account
  localStorage.removeItem("lastSyncTime");
  _lastSyncTime = null;

  // Reinitialize sync engine with new userId
  userId = newUserId;
  const backend = new SupabaseBackend(supabase, newUserId);
  engine = new SyncEngine(db, backend, stateStore, newUserId);
  _syncEnabled = true;
  localStorage.setItem("syncEnabled", "true");

  // Push everything under the new account
  await syncNow();
}

export async function hasPendingChanges(): Promise<boolean> {
  const pendingTrails = await db.trails.filter((t) => t.syncStatus !== SyncStatus.Synced).count();
  if (pendingTrails > 0) return true;
  const pendingVisits = await db.visits.filter((v) => v.syncStatus !== SyncStatus.Synced).count();
  return pendingVisits > 0;
}

export async function initSync(): Promise<void> {
  if (localStorage.getItem("syncEnabled") === "true") {
    await enableSync();
    await syncNow();
    // Periodic sync every 5 minutes while tab is visible
    setInterval(() => {
      if (document.visibilityState === "visible" && engine) {
        syncNow();
      }
    }, 5 * 60 * 1000);
  }
}
