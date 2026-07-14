import { getSettings } from "../shared/settings.js";
import type { ExtensionSettings } from "../shared/settings.js";
import { getDeviceId } from "../shared/device-id.js";
import { TrailManager } from "./trail-manager.js";
import { handleNavigation } from "./capture.js";
import { parseTabIdFromAlarm, clearIdleAlarm } from "./alarm-manager.js";
import * as data from "./data-layer.js";
import * as auth from "./auth-layer.js";
import * as sync from "./sync-layer.js";
import type { BackgroundMessage } from "../shared/messaging.js";

const SYNC_ALARM = "sync-interval";

const trailManager = new TrailManager();
// Store the last clicked link text per tab (sent by content script on click)
const lastClickedLinkText = new Map<number, string>();
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
chrome.alarms.create("reconcile-trails", { delayInMinutes: 0.1, periodInMinutes: 15 }); // ~6 seconds, then every 15 min

// On startup, match active trails to currently open tabs by URL.
// Tab IDs change across browser restarts, so we match by the last visit's URL
// against what's currently open. Matched trails get re-associated with the new
// tab ID. Unmatched trails get finalized.
async function reconcileActiveTrails() {
  try {
    const activeTrails = await data.getActiveTrails();
    console.log("[breadcrumbs] reconcile: active trails:", activeTrails.length);
    if (activeTrails.length === 0) return;

    // Build a map of open Wikipedia tabs: URL -> tab
    const tabs = await chrome.tabs.query({ url: "*://*.wikipedia.org/*" });
    const urlToTab = new Map<string, chrome.tabs.Tab>();
    for (const tab of tabs) {
      if (tab.url && tab.id != null) urlToTab.set(tab.url, tab);
    }

    for (const trail of activeTrails) {
      const visits = await data.getVisitsByTrailId(trail.id);
      const lastVisit = visits[visits.length - 1];
      if (!lastVisit) continue;

      // Try to match by any visit URL in the trail, not just the last one
      let matchTab: chrome.tabs.Tab | undefined = urlToTab.get(lastVisit.url);
      if (!matchTab) {
        matchTab = [...urlToTab.entries()].find(([url]) => {
          try { return new URL(url).pathname.includes(lastVisit.articleId); }
          catch { return false; }
        })?.[1];
      }
      if (!matchTab) {
        for (const visit of visits) {
          matchTab = urlToTab.get(visit.url);
          if (matchTab) break;
          matchTab = [...urlToTab.entries()].find(([url]) => {
            try { return new URL(url).pathname.includes(visit.articleId); }
            catch { return false; }
          })?.[1];
          if (matchTab) break;
        }
      }

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
      }
    }

    // Finalize stale unmatched trails
    const staleThresholdMs = settings.idleTimeoutMinutes * 60 * 1000 * 2;
    const now = Date.now();
    for (const trail of activeTrails) {
      if (!trailManager.getByTrailId(trail.id)) {
        const age = now - new Date(trail.updatedAt).getTime();
        if (age > staleThresholdMs) {
          await data.finalizeTrail(trail.id);
        }
      }
    }
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
      sync.enableSync();
    } else {
      chrome.alarms.clear(SYNC_ALARM);
      sync.disableSync();
    }
  }
});

chrome.webNavigation.onCommitted.addListener(async (details) => {
  if (!settings.captureEnabled) return;
  let windowId = 0;
  try { windowId = (await chrome.tabs.get(details.tabId)).windowId; } catch {}
  // Get and clear the clicked link text for this tab (set by content script before navigation)
  const clickedText = lastClickedLinkText.get(details.tabId) ?? null;
  lastClickedLinkText.delete(details.tabId);

  await handleNavigation(
    {
      tabId: details.tabId,
      url: details.url,
      frameId: details.frameId,
      windowId,
      transitionType: details.transitionType,
      transitionQualifiers: details.transitionQualifiers,
      clickedLinkText: clickedText,
    },
    trailManager, deviceId, settings.idleTimeoutMinutes
  );
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const entry = trailManager.getActive(tabId);
  if (entry) {
    await data.finalizeTrail(entry.trailId);
    trailManager.removeTab(tabId);
    await clearIdleAlarm(tabId);
  }
});

chrome.tabs.onReplaced.addListener(async (_addedTabId, removedTabId) => {
  const entry = trailManager.getActive(removedTabId);
  if (entry) {
    await data.finalizeTrail(entry.trailId);
    trailManager.removeTab(removedTabId);
    await clearIdleAlarm(removedTabId);
  }
});

chrome.windows.onRemoved.addListener(async (windowId) => {
  const tabIds = trailManager.getTabsForWindow(windowId);
  for (const tabId of tabIds) {
    const entry = trailManager.getActive(tabId);
    if (entry) {
      await data.finalizeTrail(entry.trailId);
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
    await sync.syncNow();
    return;
  }
  const tabId = parseTabIdFromAlarm(alarm.name);
  if (tabId !== null) {
    const entry = trailManager.getActive(tabId);
    if (entry) {
      await data.finalizeTrail(entry.trailId);
    }
    trailManager.removeTab(tabId);
    await clearIdleAlarm(tabId);
  }
});

chrome.runtime.onMessage.addListener((message: any, _sender, sendResponse) => {
  // Content script sends clicked link text immediately on click
  if (message.type === "linkClicked" && _sender.tab?.id) {
    lastClickedLinkText.set(_sender.tab.id, message.text);
    return false;
  }
  handleBackgroundMessage(message as BackgroundMessage, sendResponse);
  return true;
});

async function handleBackgroundMessage(message: BackgroundMessage, sendResponse: (response: unknown) => void) {
  switch (message.type) {
    case "getCurrentTrail": {
      let entry = trailManager.getActive(message.tabId);

      if (!entry) {
        let recovered = await data.getActiveTrailForTab(message.tabId);
        if (!recovered) {
          try {
            const tab = await chrome.tabs.get(message.tabId);
            if (tab.url) {
              const { parseWikipediaUrl } = await import("@wikipedia-breadcrumbs/shared");
              const parsed = parseWikipediaUrl(tab.url);
              if (parsed) recovered = await data.getActiveTrailByUrl(parsed.cleanUrl);
            }
          } catch {}
        }
        if (recovered) {
          const { trail, lastVisit, visitCount } = recovered;
          let winId = 0;
          try { winId = (await chrome.tabs.get(message.tabId)).windowId; } catch {}
          entry = {
            trailId: trail.id, tabId: message.tabId, windowId: winId,
            lastVisitTimestamp: new Date(lastVisit.timestamp).getTime(), lastVisitPosition: visitCount,
            lastVisitUrl: lastVisit.url,
          };
          trailManager.setActive(message.tabId, entry);
        }
      }

      if (entry) {
        const visits = await data.getVisitsByTrailId(entry.trailId);
        const trail = await data.getTrailById(entry.trailId);
        sendResponse({ trail: trail ?? null, visits });
      } else {
        sendResponse({ trail: null, visits: [] });
      }
      break;
    }
    case "startNewTrail": {
      const existing = trailManager.getActive(message.tabId);
      if (existing) {
        await data.finalizeTrail(existing.trailId);
        trailManager.removeTab(message.tabId);
      }
      try {
        const tab = await chrome.tabs.get(message.tabId);
        if (tab.url) {
          const { parseWikipediaUrl, createTrail, createVisit, StartReason, SourceType } = await import("@wikipedia-breadcrumbs/shared");
          const parsed = parseWikipediaUrl(tab.url);
          if (parsed) {
            const trail = createTrail({ startReason: StartReason.Manual, deviceId });
            await data.addTrail(trail);
            const visit = createVisit({
              trailId: trail.id, url: parsed.cleanUrl, title: parsed.title, position: 1,
              sourceType: SourceType.Manual, language: parsed.language,
              articleId: parsed.cleanUrl.split("/wiki/")[1] ?? parsed.title,
              tabId: message.tabId,
            });
            await data.addVisit(visit);
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
      await data.finalizeTrail(message.trailId);
      trailManager.removeByTrailId(message.trailId);
      sendResponse({ ok: true });
      break;
    }
    case "renameTrail": {
      await data.updateTrail(message.trailId, { name: message.name });
      sendResponse({ ok: true });
      break;
    }
    case "resumeTrailInNewTab": {
      await data.updateTrail(message.trailId, { status: "active" as any, endedAt: null as any });
      const visitCount = (await data.getVisitsByTrailId(message.trailId)).length;

      const newTab = await chrome.tabs.create({ url: message.url });
      if (newTab.id != null) {
        trailManager.setActive(newTab.id, {
          trailId: message.trailId, tabId: newTab.id, windowId: newTab.windowId ?? 0,
          lastVisitTimestamp: Date.now(), lastVisitPosition: visitCount, lastVisitUrl: message.url,
        });
      }
      sendResponse({ ok: true });
      break;
    }
    case "navigateActiveTrail": {
      const entry = trailManager.getByTrailId(message.trailId);
      if (entry) {
        try {
          await chrome.tabs.update(entry.tabId, { active: true, url: message.url });
          await chrome.windows.update(entry.windowId, { focused: true });
        } catch {
          const newTab = await chrome.tabs.create({ url: message.url });
          if (newTab.id != null) {
            trailManager.removeTab(entry.tabId);
            trailManager.setActive(newTab.id, { ...entry, tabId: newTab.id, windowId: newTab.windowId ?? 0, lastVisitUrl: message.url });
          }
        }
      } else {
        await data.updateTrail(message.trailId, { status: "active" as any, endedAt: null as any });
        const visitCount = (await data.getVisitsByTrailId(message.trailId)).length;
        const newTab = await chrome.tabs.create({ url: message.url });
        if (newTab.id != null) {
          trailManager.setActive(newTab.id, {
            trailId: message.trailId, tabId: newTab.id, windowId: newTab.windowId ?? 0,
            lastVisitTimestamp: Date.now(), lastVisitPosition: visitCount, lastVisitUrl: message.url,
          });
        }
      }
      sendResponse({ ok: true });
      break;
    }
    case "trailMutated":
    case "trailDeleted": {
      trailManager.removeByTrailId(message.trailId);
      sendResponse({ ok: true });
      break;
    }
    case "syncNow": { sendResponse(await sync.syncNow()); break; }
    case "enableSync": { sendResponse(await sync.enableSync()); break; }
    case "disableSync": { sendResponse(await sync.disableSync()); break; }
    case "getSyncStatus": { sendResponse(await sync.getSyncStatus()); break; }
    case "reinitSync": { sendResponse(await sync.reinitSync()); break; }
    case "signInWithGoogle": { sendResponse(await auth.signInWithGoogle(message.idToken, message.nonce)); break; }
    case "signInWithEmail": { sendResponse(await auth.signInWithEmail(message.email, message.password)); break; }
    case "signUpWithEmail": { sendResponse(await auth.signUpWithEmail(message.email, message.password)); break; }
    case "signOut": { sendResponse(await auth.signOut()); break; }
    case "getAuthStatus": { sendResponse(await auth.getAuthStatus()); break; }
    case "signInWithWikimedia": {
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
        const redirectUrl = chrome.identity.getRedirectURL();
        const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
        const authResp = await fetch(
          `${supabaseUrl}/functions/v1/wikimedia-oauth?action=authorize&redirect_to=${encodeURIComponent(redirectUrl)}`,
          { headers: { "apikey": supabaseKey, "Authorization": `Bearer ${supabaseKey}` } }
        );
        const { url: wikimediaAuthUrl } = await authResp.json();
        if (!wikimediaAuthUrl) {
          sendResponse({ success: false, error: "Failed to get authorization URL" });
          break;
        }

        const responseUrl = await new Promise<string>((resolve, reject) => {
          chrome.identity.launchWebAuthFlow(
            { url: wikimediaAuthUrl, interactive: true },
            (callbackUrl) => {
              if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
              else if (callbackUrl) resolve(callbackUrl);
              else reject(new Error("No callback URL"));
            }
          );
        });

        const cbUrl = new URL(responseUrl);
        let params = new URLSearchParams(cbUrl.hash.substring(1));
        let accessToken = params.get("access_token");
        let refreshToken = params.get("refresh_token");
        if (!accessToken) {
          params = cbUrl.searchParams;
          accessToken = params.get("access_token");
          refreshToken = params.get("refresh_token");
        }

        if (accessToken && refreshToken) {
          sendResponse(await auth.signInWithWikimedia(accessToken, refreshToken));
        } else {
          const error = cbUrl.searchParams.get("wikimedia_error") ?? "No tokens in callback";
          sendResponse({ success: false, error });
        }
      } catch (err: any) {
        sendResponse({ success: false, error: err.message ?? "Wikimedia sign-in failed" });
      }
      break;
    }
  }
}
