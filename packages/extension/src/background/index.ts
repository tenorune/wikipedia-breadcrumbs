import { getSettings } from "../shared/settings.js";
import type { ExtensionSettings } from "../shared/settings.js";
import { getDeviceId } from "../shared/device-id.js";
import { TrailManager } from "./trail-manager.js";
import { handleNavigation } from "./capture.js";
import { parseTabIdFromAlarm, clearIdleAlarm } from "./alarm-manager.js";
import { sendToOffscreen } from "./offscreen.js";
import type { BackgroundMessage } from "../shared/messaging.js";

const SYNC_ALARM = "sync-interval";

const trailManager = new TrailManager();
let deviceId = "";
let settings: ExtensionSettings = { idleTimeoutMinutes: 30, captureEnabled: true, syncEnabled: false };

async function initialize() {
  deviceId = await getDeviceId();
  settings = await getSettings();
  if (settings.syncEnabled) {
    chrome.alarms.create(SYNC_ALARM, { periodInMinutes: 5 });
  }
  // Don't reconcile immediately — tabs may not be restored yet.
  // Wait for the first tab to finish loading, which signals the browser
  // has restored its session.
}

// Reconcile after browser has had time to restore tabs.
// Use an alarm to delay — this survives SW termination unlike setTimeout.
chrome.alarms.create("reconcile-trails", { delayInMinutes: 0.1 }); // ~6 seconds

// On startup, match active trails to currently open tabs by URL.
// Tab IDs change across browser restarts, so we match by the last visit's URL
// against what's currently open. Matched trails get re-associated with the new
// tab ID. Unmatched trails get finalized.
async function reconcileActiveTrails() {
  try {
    const result = await sendToOffscreen({ type: "getActiveTrails" });
    console.log("[breadcrumbs] reconcile: getActiveTrails result:", result.success, result.success ? (result.data as any[])?.length : result.error);
    if (!result.success || !result.data) return;
    const activeTrails = result.data as any[];
    if (activeTrails.length === 0) return;

    // Build a map of open Wikipedia tabs: URL -> tab
    const tabs = await chrome.tabs.query({ url: "*://*.wikipedia.org/*" });
    console.log("[breadcrumbs] reconcile: open Wikipedia tabs:", tabs.length, tabs.map(t => ({ id: t.id, url: t.url?.slice(0, 80) })));
    const urlToTab = new Map<string, chrome.tabs.Tab>();
    for (const tab of tabs) {
      if (tab.url && tab.id != null) {
        urlToTab.set(tab.url, tab);
      }
    }

    for (const trail of activeTrails) {
      const visitsResult = await sendToOffscreen({ type: "getVisitsByTrailId", trailId: trail.id });
      if (!visitsResult.success) continue;
      const visits = visitsResult.data as any[];
      const lastVisit = visits[visits.length - 1];
      console.log("[breadcrumbs] reconcile: trail", trail.id.slice(0, 8), "lastVisit url:", lastVisit?.url?.slice(0, 80), "articleId:", lastVisit?.articleId);
      if (!lastVisit) {
        console.log("[breadcrumbs] reconcile: no visits, finalizing trail", trail.id.slice(0, 8));
        await sendToOffscreen({ type: "finalizeTrail", trailId: trail.id });
        continue;
      }

      // Try to match by exact URL, then by articleId substring
      const matchTab = urlToTab.get(lastVisit.url)
        ?? [...urlToTab.entries()].find(([url]) => url.includes(lastVisit.articleId))?.[1];

      console.log("[breadcrumbs] reconcile: trail", trail.id.slice(0, 8), "matched tab:", matchTab?.id ?? "NONE");

      if (matchTab && matchTab.id != null) {
        trailManager.setActive(matchTab.id, {
          trailId: trail.id,
          tabId: matchTab.id,
          windowId: matchTab.windowId ?? 0,
          lastVisitTimestamp: new Date(lastVisit.timestamp).getTime(),
          lastVisitPosition: visits.length,
          lastVisitUrl: lastVisit.url,
        });
        urlToTab.delete(matchTab.url!);
      } else {
        await sendToOffscreen({ type: "finalizeTrail", trailId: trail.id });
      }
    }
    console.log("[breadcrumbs] reconcile: done. trailManager entries:", [...Array(1000).keys()].filter(i => trailManager.getActive(i)).length);
  } catch (err) {
    console.error("[breadcrumbs] reconcile failed:", err);
  }
}

chrome.runtime.onInstalled.addListener(initialize);
chrome.runtime.onStartup.addListener(initialize);
initialize();

chrome.storage.onChanged.addListener((changes) => {
  if (changes.idleTimeoutMinutes) settings.idleTimeoutMinutes = changes.idleTimeoutMinutes.newValue;
  if (changes.captureEnabled) settings.captureEnabled = changes.captureEnabled.newValue;
  if (changes.syncEnabled) {
    settings.syncEnabled = changes.syncEnabled.newValue;
    if (changes.syncEnabled.newValue) {
      chrome.alarms.create(SYNC_ALARM, { periodInMinutes: 5 });
      sendToOffscreen({ type: "enableSync" });
    } else {
      chrome.alarms.clear(SYNC_ALARM);
      sendToOffscreen({ type: "disableSync" });
    }
  }
});

chrome.webNavigation.onCommitted.addListener(async (details) => {
  if (!settings.captureEnabled) return;
  let windowId = 0;
  try { windowId = (await chrome.tabs.get(details.tabId)).windowId; } catch {}
  await handleNavigation(
    {
      tabId: details.tabId,
      url: details.url,
      frameId: details.frameId,
      windowId,
      transitionType: details.transitionType,
      transitionQualifiers: details.transitionQualifiers,
    },
    trailManager, deviceId, settings.idleTimeoutMinutes
  );
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const entry = trailManager.getActive(tabId);
  if (entry) {
    await sendToOffscreen({ type: "finalizeTrail", trailId: entry.trailId });
    trailManager.removeTab(tabId);
    await clearIdleAlarm(tabId);
  }
});

chrome.tabs.onReplaced.addListener(async (_addedTabId, removedTabId) => {
  const entry = trailManager.getActive(removedTabId);
  if (entry) {
    await sendToOffscreen({ type: "finalizeTrail", trailId: entry.trailId });
    trailManager.removeTab(removedTabId);
    await clearIdleAlarm(removedTabId);
  }
});

chrome.windows.onRemoved.addListener(async (windowId) => {
  const tabIds = trailManager.getTabsForWindow(windowId);
  for (const tabId of tabIds) {
    const entry = trailManager.getActive(tabId);
    if (entry) {
      await sendToOffscreen({ type: "finalizeTrail", trailId: entry.trailId });
      trailManager.removeTab(tabId);
      await clearIdleAlarm(tabId);
    }
  }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "reconcile-trails") {
    await reconcileActiveTrails();
    return;
  }
  if (alarm.name === SYNC_ALARM) {
    await sendToOffscreen({ type: "syncNow" });
    return;
  }
  const tabId = parseTabIdFromAlarm(alarm.name);
  if (tabId !== null) trailManager.removeTab(tabId);
});

chrome.runtime.onMessage.addListener((message: any, _sender, sendResponse) => {
  if (message.target === "offscreen") return false;
  handleBackgroundMessage(message as BackgroundMessage, sendResponse);
  return true;
});

async function handleBackgroundMessage(message: BackgroundMessage, sendResponse: (response: unknown) => void) {
  switch (message.type) {
    case "getCurrentTrail": {
      const entry = trailManager.getActive(message.tabId);
      if (entry) {
        const result = await sendToOffscreen({ type: "getVisitsByTrailId", trailId: entry.trailId });
        const trailResult = await sendToOffscreen({ type: "getTrailById", trailId: entry.trailId });
        sendResponse({ trail: trailResult.success ? trailResult.data : null, visits: result.success ? result.data : [] });
      } else {
        const result = await sendToOffscreen({ type: "getActiveTrailForTab", tabId: message.tabId });
        if (result.success && result.data) {
          const { trail, lastVisit, visitCount } = result.data as any;
          let winId = 0;
          try { winId = (await chrome.tabs.get(message.tabId)).windowId; } catch {}
          trailManager.setActive(message.tabId, {
            trailId: trail.id, tabId: message.tabId, windowId: winId,
            lastVisitTimestamp: new Date(lastVisit.timestamp).getTime(), lastVisitPosition: visitCount,
            lastVisitUrl: lastVisit.url,
          });
          const visits = await sendToOffscreen({ type: "getVisitsByTrailId", trailId: trail.id });
          sendResponse({ trail, visits: visits.success ? visits.data : [] });
        } else {
          sendResponse({ trail: null, visits: [] });
        }
      }
      break;
    }
    case "startNewTrail": {
      // End any existing trail on this tab
      const existing = trailManager.getActive(message.tabId);
      if (existing) {
        await sendToOffscreen({ type: "finalizeTrail", trailId: existing.trailId });
        trailManager.removeTab(message.tabId);
      }
      // Create a new trail immediately from the tab's current page
      try {
        const tab = await chrome.tabs.get(message.tabId);
        if (tab.url) {
          const { parseWikipediaUrl, createTrail, createVisit, StartReason, SourceType } = await import("@wikipedia-breadcrumbs/shared");
          const parsed = parseWikipediaUrl(tab.url);
          if (parsed) {
            const trail = createTrail({ startReason: StartReason.Manual, deviceId });
            await sendToOffscreen({ type: "addTrail", trail });
            const visit = createVisit({
              trailId: trail.id, url: parsed.cleanUrl, title: parsed.title, position: 1,
              sourceType: SourceType.Manual, language: parsed.language,
              articleId: parsed.cleanUrl.split("/wiki/")[1] ?? parsed.title,
              tabId: message.tabId,
            });
            await sendToOffscreen({ type: "addVisit", visit });
            trailManager.setActive(message.tabId, {
              trailId: trail.id, tabId: message.tabId,
              windowId: tab.windowId ?? 0,
              lastVisitTimestamp: Date.now(), lastVisitPosition: 1,
              lastVisitUrl: parsed.cleanUrl,
            });
          }
        }
      } catch { /* tab may not be a Wikipedia page */ }
      sendResponse({ ok: true });
      break;
    }
    case "endTrail": {
      await sendToOffscreen({ type: "finalizeTrail", trailId: message.trailId });
      trailManager.removeByTrailId(message.trailId);
      sendResponse({ ok: true });
      break;
    }
    case "renameTrail": {
      await sendToOffscreen({ type: "updateTrail", trailId: message.trailId, changes: { name: message.name } });
      sendResponse({ ok: true });
      break;
    }
    case "resumeTrailInNewTab": {
      // Reactivate a finalized trail: set up trail manager FIRST, then create tab.
      // This prevents the race where onCommitted fires before the trail is registered.
      await sendToOffscreen({
        type: "updateTrail",
        trailId: message.trailId,
        changes: { status: "active" as any, endedAt: null as any },
      });
      const visitsResult = await sendToOffscreen({ type: "getVisitsByTrailId", trailId: message.trailId });
      const visitCount = visitsResult.success ? (visitsResult.data as any[]).length : 0;

      // Create the tab
      const newTab = await chrome.tabs.create({ url: message.url });
      if (newTab.id != null) {
        trailManager.setActive(newTab.id, {
          trailId: message.trailId,
          tabId: newTab.id,
          windowId: newTab.windowId ?? 0,
          lastVisitTimestamp: Date.now(),
          lastVisitPosition: visitCount,
          lastVisitUrl: message.url,
        });
      }
      sendResponse({ ok: true });
      break;
    }
    case "navigateActiveTrail": {
      // Background knows the real tab ID — use it to navigate
      const entry = trailManager.getByTrailId(message.trailId);
      if (entry) {
        try {
          await chrome.tabs.update(entry.tabId, { active: true, url: message.url });
          await chrome.windows.update(entry.windowId, { focused: true });
        } catch {
          // Tab gone — open new tab and reassociate
          const newTab = await chrome.tabs.create({ url: message.url });
          if (newTab.id != null) {
            trailManager.removeTab(entry.tabId);
            trailManager.setActive(newTab.id, {
              ...entry,
              tabId: newTab.id,
              windowId: newTab.windowId ?? 0,
              lastVisitUrl: message.url,
            });
          }
        }
      } else {
        // Not in memory — treat as resume
        await sendToOffscreen({
          type: "updateTrail",
          trailId: message.trailId,
          changes: { status: "active" as any, endedAt: null as any },
        });
        const visitsResult = await sendToOffscreen({ type: "getVisitsByTrailId", trailId: message.trailId });
        const visitCount = visitsResult.success ? (visitsResult.data as any[]).length : 0;
        const newTab = await chrome.tabs.create({ url: message.url });
        if (newTab.id != null) {
          trailManager.setActive(newTab.id, {
            trailId: message.trailId,
            tabId: newTab.id,
            windowId: newTab.windowId ?? 0,
            lastVisitTimestamp: Date.now(),
            lastVisitPosition: visitCount,
            lastVisitUrl: message.url,
          });
        }
      }
      sendResponse({ ok: true });
      break;
    }
    case "trailMutated": {
      trailManager.removeByTrailId(message.trailId);
      sendResponse({ ok: true });
      break;
    }
    case "trailDeleted": {
      trailManager.removeByTrailId(message.trailId);
      sendResponse({ ok: true });
      break;
    }
    case "syncComplete": {
      // Offscreen notifies us when async sync finishes — store the time
      await chrome.storage.local.set({ lastSyncTime: (message as any).completedAt });
      sendResponse({ ok: true });
      break;
    }
    case "syncNow":
    case "enableSync":
    case "getSyncStatus":
    case "disableSync": {
      const result = await sendToOffscreen(message as any);
      sendResponse(result);
      break;
    }
  }
}
