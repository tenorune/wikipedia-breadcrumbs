import { getSettings } from "../shared/settings.js";
import { getDeviceId } from "../shared/device-id.js";
import { TrailManager } from "./trail-manager.js";
import { handleNavigation } from "./capture.js";
import { parseTabIdFromAlarm, clearIdleAlarm } from "./alarm-manager.js";
import { sendToOffscreen } from "./offscreen.js";
import type { BackgroundMessage } from "../shared/messaging.js";

const trailManager = new TrailManager();
let deviceId = "";
let settings = { idleTimeoutMinutes: 30, captureEnabled: true };

async function initialize() {
  deviceId = await getDeviceId();
  settings = await getSettings();
}

chrome.runtime.onInstalled.addListener(initialize);
chrome.runtime.onStartup.addListener(initialize);
initialize();

chrome.storage.onChanged.addListener((changes) => {
  if (changes.idleTimeoutMinutes) settings.idleTimeoutMinutes = changes.idleTimeoutMinutes.newValue;
  if (changes.captureEnabled) settings.captureEnabled = changes.captureEnabled.newValue;
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

chrome.alarms.onAlarm.addListener((alarm) => {
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
      trailManager.removeTab(message.tabId);
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
  }
}
