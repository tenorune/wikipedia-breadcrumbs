import {
  SyncEngine, SupabaseBackend, SyncStatus, trailStore, visitStore,
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

export const syncState = {
  get syncEnabled() { return _syncEnabled; },
  get lastSyncTime() { return _lastSyncTime; },
  get syncing() { return _syncing; },
  get lastReport() { return _lastReport; },
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
    console.log("[pwa] enableSync: using existing session, userId:", userId.slice(0, 8));
  } else {
    // No session — require sign-in, don't create anonymous user
    console.log("[pwa] enableSync: no session, sync requires sign-in");
    return;
  }

  // Stamp local trails with userId
  const allTrails = await db.trails.filter((t) => t.userId !== userId).toArray();
  for (const trail of allTrails) {
    await db.trails.update(trail.id, { userId, syncStatus: SyncStatus.PendingSync });
  }
  const allVisits = await db.visits.filter((v) => v.syncStatus !== SyncStatus.Synced).toArray();
  for (const visit of allVisits) {
    await db.visits.update(visit.id, { syncStatus: SyncStatus.PendingSync });
  }

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
  _syncing = true;
  try {
    const report = await engine.syncNow();
    _lastReport = report;
    console.log("[pwa] Sync complete:", report);
  } catch (err) {
    console.error("[pwa] Sync error:", err);
  } finally {
    _syncing = false;
  }
}

export async function upgradeToAuthenticatedUser(newUserId: string): Promise<void> {
  // Re-stamp all trails with new userId
  const allTrails = await db.trails.toArray();
  for (const trail of allTrails) {
    if (trail.userId !== newUserId) {
      await db.trails.update(trail.id, { userId: newUserId, syncStatus: SyncStatus.PendingSync });
    }
  }
  // Mark all visits for re-push
  const allVisits = await db.visits.toArray();
  for (const visit of allVisits) {
    await db.visits.update(visit.id, { syncStatus: SyncStatus.PendingSync });
  }

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
