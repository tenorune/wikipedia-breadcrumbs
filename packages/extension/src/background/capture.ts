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

  // Try in-memory first, then recover from DB if SW was restarted
  let current = trailManager.getActive(tabId);
  if (!current) {
    // Try by tabId first (SW restart, same session)
    let recovered = await sendToOffscreen({ type: "getActiveTrailForTab", tabId });
    // Fall back to URL match (browser restart, tab IDs changed)
    if ((!recovered.success || !recovered.data) && parsed) {
      recovered = await sendToOffscreen({ type: "getActiveTrailByUrl", url: parsed.cleanUrl });
    }
    if (recovered.success && recovered.data) {
      const { trail, lastVisit, visitCount } = recovered.data as any;
      current = {
        trailId: trail.id,
        tabId,
        windowId: details.windowId,
        lastVisitTimestamp: new Date(lastVisit.timestamp).getTime(),
        lastVisitPosition: visitCount,
        lastVisitUrl: lastVisit.url,
      };
      trailManager.setActive(tabId, current);
    }
  }

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

  if (detection.isNew || !current) {
    // New trail
    const trail = createTrail({
      startReason: detection.isNew ? detection.reason : StartReason.AutoNewTab,
      deviceId,
    });
    await sendToOffscreen({ type: "addTrail", trail });

    const visit = createVisit({
      trailId: trail.id, url: parsed.cleanUrl, title: parsed.title, position: 1,
      sourceType: inferSourceType(transitionType, transitionQualifiers),
      sourceDetail: inferSourceDetail(transitionType, transitionQualifiers),
      language: parsed.language,
      articleId: parsed.cleanUrl.split("/wiki/")[1] ?? parsed.title, tabId,
    });
    await sendToOffscreen({ type: "addVisit", visit });

    trailManager.setActive(tabId, {
      trailId: trail.id, tabId, windowId: details.windowId,
      lastVisitTimestamp: Date.now(), lastVisitPosition: 1,
      lastVisitUrl: parsed.cleanUrl,
    });
  } else {
    // Same trail — check if this URL is already in the trail
    const existing = await sendToOffscreen({
      type: "findVisitByUrl",
      trailId: current.trailId,
      url: parsed.cleanUrl,
    });

    const now = new Date().toISOString();
    if (existing.success && existing.data) {
      // Revisit — update lastVisitedAt, preserve original discovery timestamp
      await sendToOffscreen({
        type: "updateVisit",
        visitId: (existing.data as any).id,
        changes: { lastVisitedAt: now },
      });
    } else {
      // New page — append to trail
      const position = trailManager.incrementPosition(tabId, parsed.cleanUrl);
      const visit = createVisit({
        trailId: current.trailId, url: parsed.cleanUrl, title: parsed.title, position,
        sourceType: inferSourceType(transitionType, transitionQualifiers),
        sourceDetail: inferSourceDetail(transitionType, transitionQualifiers),
        language: parsed.language,
        articleId: parsed.cleanUrl.split("/wiki/")[1] ?? parsed.title, tabId,
      });
      await sendToOffscreen({ type: "addVisit", visit });
    }

    // Bump trail's updatedAt so "Most Recent" sort reflects activity
    await sendToOffscreen({
      type: "updateTrail",
      trailId: current.trailId,
      changes: { updatedAt: now } as any,
    });

    // Update last visit URL regardless
    current.lastVisitUrl = parsed.cleanUrl;
    current.lastVisitTimestamp = Date.now();
  }

  await resetIdleAlarm(tabId, idleTimeoutMinutes);
}
