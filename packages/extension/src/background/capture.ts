import { parseWikipediaUrl, createVisit, createTrail, shouldStartNewTrail, SourceType, StartReason } from "@wikipedia-breadcrumbs/shared";
import type { TrailDetectionContext } from "@wikipedia-breadcrumbs/shared";
import { sendToOffscreen } from "./offscreen.js";
import { TrailManager } from "./trail-manager.js";
import { resetIdleAlarm } from "./alarm-manager.js";

export interface NavigationDetails {
  tabId: number;
  url: string;
  frameId: number;
  windowId: number;
  transitionType: string;
  transitionQualifiers: string[];
}

function inferSourceType(transitionType: string, transitionQualifiers: string[]): SourceType {
  // Chrome transition types: https://developer.chrome.com/docs/extensions/reference/api/webNavigation#type-TransitionType
  switch (transitionType) {
    case "link":
      return SourceType.Link;
    case "typed":
    case "auto_bookmark":
    case "keyword":
    case "keyword_generated":
      return SourceType.External;
    case "generated": // e.g. search suggestions, omnibox
      return SourceType.Search;
    case "reload":
    case "auto_toplevel":
      return SourceType.Link; // treat reloads/redirects as link
    default:
      return SourceType.Link;
  }
}

function inferSourceDetail(transitionType: string, transitionQualifiers: string[]): string | null {
  if (transitionQualifiers.includes("from_address_bar")) return "address bar";
  if (transitionType === "typed") return "typed URL";
  if (transitionType === "auto_bookmark") return "bookmark";
  if (transitionType === "generated") return "omnibox suggestion";
  return null;
}

function isExternalTransition(transitionType: string, transitionQualifiers: string[]): boolean {
  return transitionType === "typed"
    || transitionType === "auto_bookmark"
    || transitionQualifiers.includes("from_address_bar");
}

export async function handleNavigation(
  details: NavigationDetails, trailManager: TrailManager, deviceId: string, idleTimeoutMinutes: number
): Promise<void> {
  if (details.frameId !== 0) return;
  const parsed = parseWikipediaUrl(details.url);
  if (!parsed) return;
  if (parsed.title.endsWith("(disambiguation)")) return;

  const { tabId, transitionType, transitionQualifiers } = details;

  const current = trailManager.getActive(tabId);
  const isMainPage = parsed.title === "Main Page";
  const isFromSearch = transitionType === "generated";
  const isExternal = isExternalTransition(transitionType, transitionQualifiers);

  const context: TrailDetectionContext = {
    currentTrailTabId: current?.tabId ?? null,
    currentTrailWindowId: current?.windowId ?? null,
    newTabId: tabId,
    newWindowId: details.windowId,
    isNewTab: current === undefined,
    transitionType,
    referrerUrl: isExternal ? "external" : null,
    newUrl: details.url,
    msSinceLastVisit: current ? Date.now() - current.lastVisitTimestamp : Infinity,
    idleTimeoutMs: idleTimeoutMinutes * 60 * 1000,
    isMainPage,
    isFromSearch,
  };

  const detection = shouldStartNewTrail(context);
  const sourceType = inferSourceType(transitionType, transitionQualifiers);
  const sourceDetail = inferSourceDetail(transitionType, transitionQualifiers);

  if (detection.isNew || !current) {
    const trail = createTrail({
      startReason: detection.isNew ? detection.reason : StartReason.AutoNewTab,
      deviceId,
    });
    await sendToOffscreen({ type: "addTrail", trail });

    const visit = createVisit({
      trailId: trail.id, url: parsed.cleanUrl, title: parsed.title, position: 1,
      sourceType, sourceDetail, language: parsed.language,
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
      sourceType, sourceDetail, language: parsed.language,
      articleId: parsed.cleanUrl.split("/wiki/")[1] ?? parsed.title, tabId,
    });
    await sendToOffscreen({ type: "addVisit", visit });
  }

  await resetIdleAlarm(tabId, idleTimeoutMinutes);
}
