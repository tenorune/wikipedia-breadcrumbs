import { parseWikipediaUrl, createVisit, createTrail, shouldStartNewTrail, SourceType, StartReason } from "@wikipedia-breadcrumbs/shared";
import type { TrailDetectionContext } from "@wikipedia-breadcrumbs/shared";
import { sendToOffscreen } from "./offscreen.js";
import { TrailManager } from "./trail-manager.js";
import { resetIdleAlarm } from "./alarm-manager.js";
import type { ContentResponse } from "../shared/messaging.js";

interface NavigationDetails {
  tabId: number;
  url: string;
  frameId: number;
  windowId: number;
}

async function getClickContext(tabId: number): Promise<{ clickedLinkText: string | null; referrerUrl: string | null }> {
  try {
    const response: ContentResponse = await Promise.race([
      chrome.tabs.sendMessage(tabId, { type: "getClickContext" }),
      new Promise<ContentResponse>((_, reject) => setTimeout(() => reject(new Error("timeout")), 500)),
    ]);
    if ("clickedLinkText" in response) return response;
  } catch { /* content script not ready */ }
  return { clickedLinkText: null, referrerUrl: null };
}

function inferSourceType(clickedLinkText: string | null, referrerUrl: string | null, isFromSearch: boolean): SourceType {
  if (isFromSearch) return SourceType.Search;
  if (referrerUrl && !referrerUrl.includes("wikipedia.org")) return SourceType.External;
  if (clickedLinkText) return SourceType.Link;
  return SourceType.External;
}

export async function handleNavigation(
  details: NavigationDetails, trailManager: TrailManager, deviceId: string, idleTimeoutMinutes: number
): Promise<void> {
  if (details.frameId !== 0) return;
  const parsed = parseWikipediaUrl(details.url);
  if (!parsed) return;

  const { tabId } = details;
  const { clickedLinkText, referrerUrl } = await getClickContext(tabId);

  const current = trailManager.getActive(tabId);
  const isMainPage = parsed.title === "Main Page";
  const isFromSearch = referrerUrl?.includes("wikipedia.org/w/index.php?search=") ?? false;

  const context: TrailDetectionContext = {
    currentTrailTabId: current?.tabId ?? null,
    currentTrailWindowId: current?.windowId ?? null,
    newTabId: tabId,
    newWindowId: details.windowId,
    isNewTab: current === undefined,
    transitionType: clickedLinkText ? "link" : "typed",
    referrerUrl,
    newUrl: details.url,
    msSinceLastVisit: current ? Date.now() - current.lastVisitTimestamp : Infinity,
    idleTimeoutMs: idleTimeoutMinutes * 60 * 1000,
    isMainPage,
    isFromSearch,
  };

  const detection = shouldStartNewTrail(context);

  if (detection.isNew || !current) {
    const trail = createTrail({
      startReason: detection.isNew ? detection.reason : StartReason.AutoNewTab,
      deviceId,
    });
    await sendToOffscreen({ type: "addTrail", trail });

    const visit = createVisit({
      trailId: trail.id, url: parsed.cleanUrl, title: parsed.title, position: 1,
      sourceType: inferSourceType(clickedLinkText, referrerUrl, isFromSearch),
      sourceDetail: clickedLinkText, language: parsed.language,
      articleId: parsed.cleanUrl.split("/wiki/")[1] ?? parsed.title, tabId,
    });
    await sendToOffscreen({ type: "addVisit", visit });

    trailManager.setActive(tabId, {
      trailId: trail.id, tabId, windowId: details.windowId,
      lastVisitTimestamp: Date.now(), lastVisitPosition: 1,
    });
  } else {
    const position = trailManager.incrementPosition(tabId);
    const visit = createVisit({
      trailId: current.trailId, url: parsed.cleanUrl, title: parsed.title, position,
      sourceType: inferSourceType(clickedLinkText, referrerUrl, isFromSearch),
      sourceDetail: clickedLinkText, language: parsed.language,
      articleId: parsed.cleanUrl.split("/wiki/")[1] ?? parsed.title, tabId,
    });
    await sendToOffscreen({ type: "addVisit", visit });
  }

  await resetIdleAlarm(tabId, idleTimeoutMinutes);
}
