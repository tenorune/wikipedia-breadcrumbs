import { parseWikipediaUrl, createVisit, createTrail, shouldStartNewTrail, SourceType, StartReason } from "@wikipedia-breadcrumbs/shared";
import type { TrailDetectionContext } from "@wikipedia-breadcrumbs/shared";
import * as data from "./data-layer.js";
import { TrailManager } from "./trail-manager.js";
import { resetIdleAlarm } from "./alarm-manager.js";

export interface NavigationDetails {
  tabId: number;
  url: string;
  frameId: number;
  windowId: number;
  transitionType: string;
  transitionQualifiers: string[];
  clickedLinkText: string | null;
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

  console.log(`[breadcrumbs] capture: tabId=${tabId} url=${parsed.cleanUrl.slice(0, 60)} transition=${transitionType}`);

  // Try in-memory first, then recover from DB if SW was restarted
  let current = trailManager.getActive(tabId);
  console.log(`[breadcrumbs] capture: in-memory entry=${!!current}${current ? ` trail=${current.trailId.slice(0, 8)}` : ""}`);
  if (!current) {
    // Try by tabId first (SW restart, same session)
    let recovered = await data.getActiveTrailForTab(tabId);
    console.log(`[breadcrumbs] capture: tabId recovery=${!!recovered}`);
    // Fall back to URL match (browser restart, tab IDs changed)
    if (!recovered && parsed) {
      recovered = await data.getActiveTrailByUrl(parsed.cleanUrl);
      console.log(`[breadcrumbs] capture: URL recovery=${!!recovered}`);
    }
    if (recovered) {
      const { trail, lastVisit, visitCount } = recovered;
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

  // Main Page is never recorded — finalize the current trail so the next
  // article the user clicks starts a fresh trail.
  if (parsed.title === "Main Page") {
    if (current) {
      await data.finalizeTrail(current.trailId);
      trailManager.removeTab(tabId);
    }
    return;
  }

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
    isMainPage: false,
    isFromSearch,
  };

  const detection = shouldStartNewTrail(context);
  console.log(`[breadcrumbs] capture: detection.isNew=${detection.isNew}${detection.isNew ? ` reason=${(detection as any).reason}` : ""} msSinceLastVisit=${current ? Date.now() - current.lastVisitTimestamp : "Infinity"} idleTimeoutMs=${idleTimeoutMinutes * 60 * 1000}`);

  if (detection.isNew || !current) {
    const trail = createTrail({
      startReason: detection.isNew ? detection.reason : StartReason.AutoNewTab,
      deviceId,
    });
    await data.addTrail(trail);

    const visit = createVisit({
      trailId: trail.id, url: parsed.cleanUrl, title: parsed.title, position: 1,
      sourceType: inferSourceType(transitionType, transitionQualifiers),
      sourceDetail: inferSourceDetail(transitionType, transitionQualifiers),
      language: parsed.language,
      articleId: parsed.cleanUrl.split("/wiki/")[1] ?? parsed.title, tabId,
    });
    await data.addVisit(visit);

    trailManager.setActive(tabId, {
      trailId: trail.id, tabId, windowId: details.windowId,
      lastVisitTimestamp: Date.now(), lastVisitPosition: 1,
      lastVisitUrl: parsed.cleanUrl,
    });
  } else {
    // Same trail — check if this URL is already in the trail.
    // findVisitByUrl also matches by articleId, so redirects are caught
    // (e.g., /wiki/Sahabah matches a visit stored as /wiki/Sahabah even if
    // its title was updated to "Companions of the Prophet").
    const existing = await data.findVisitByUrl(current.trailId, parsed.cleanUrl, parsed.title);

    const now = new Date().toISOString();
    if (existing) {
      // Revisit — update lastVisitedAt, preserve original discovery timestamp
      await data.updateVisit(existing.id, { lastVisitedAt: now });
    } else {
      // New page — find the parent visit (the page we navigated from)
      let parentVisitId: string | null = null;
      if (current.lastVisitUrl) {
        // Derive a title from the parent URL for fallback matching
        // (needed when parent was reached via redirect, e.g. lastVisitUrl is
        // /wiki/Companions_of_the_Prophet but stored visit URL is /wiki/Sahabah)
        const parentParsed = parseWikipediaUrl(current.lastVisitUrl);
        const parentVisit = await data.findVisitByUrl(current.trailId, current.lastVisitUrl, parentParsed?.title);
        if (parentVisit) {
          parentVisitId = parentVisit.id;
        }
      }

      const position = trailManager.incrementPosition(tabId, parsed.cleanUrl);
      const visit = createVisit({
        trailId: current.trailId, url: parsed.cleanUrl, title: parsed.title, position,
        sourceType: inferSourceType(transitionType, transitionQualifiers),
        sourceDetail: inferSourceDetail(transitionType, transitionQualifiers),
        language: parsed.language,
        articleId: parsed.cleanUrl.split("/wiki/")[1] ?? parsed.title,
        parentVisitId,
        tabId,
      });
      await data.addVisit(visit);
    }

    // Bump trail's updatedAt so "Most Recent" sort reflects activity
    await data.updateTrail(current.trailId, { updatedAt: now } as any);

    // Update last visit URL regardless
    current.lastVisitUrl = parsed.cleanUrl;
    current.lastVisitTimestamp = Date.now();
  }

  await resetIdleAlarm(tabId, idleTimeoutMinutes);

  // After the page loads, fetch the actual title and redirect info from the content script
  // and update the visit if the title differs (handles Wikipedia redirects)
  const capturedTrailId = current?.trailId ?? "";
  const capturedUrl = parsed.cleanUrl;
  const capturedTitle = parsed.title;
  const capturedClickedText = details.clickedLinkText;
  setTimeout(async () => {
    try {
      // Verify tab still exists and is on Wikipedia
      try {
        const tab = await chrome.tabs.get(tabId);
        if (!tab.url || !tab.url.includes("wikipedia.org")) return;
      } catch { return; }

      const pageInfo = await Promise.race([
        chrome.tabs.sendMessage(tabId, { type: "getPageInfo" }),
        new Promise((_, reject) => setTimeout(() => reject("timeout"), 2000)),
      ]) as { pageTitle: string; redirectedFrom: string | null } | undefined;

      if (pageInfo && "pageTitle" in pageInfo && pageInfo.pageTitle) {
        const actualTitle = pageInfo.pageTitle;
        const isRedirect = pageInfo.redirectedFrom !== null;

        // Verify this is still the page we navigated to:
        // either the title matches, or it's a redirect from our original article
        const titleMatches = actualTitle === capturedTitle;
        const redirectMatches = isRedirect &&
          pageInfo.redirectedFrom!.replace(/ /g, "_") === capturedTitle.replace(/ /g, "_");
        if (!titleMatches && !redirectMatches) return;

        const changes: Record<string, unknown> = {};

        // Update title to the actual page title
        if (actualTitle !== capturedTitle) {
          changes.title = actualTitle;
        }

        // Build sourceDetail: combine linked-as and redirect info
        const parts: string[] = [];
        if (capturedClickedText && capturedClickedText.toLowerCase() !== actualTitle.toLowerCase()) {
          parts.push(`linked as ${capturedClickedText}`);
        }
        // Only mention redirect separately if it differs from the clicked text
        if (isRedirect && pageInfo.redirectedFrom !== capturedClickedText) {
          parts.push(`redirected from ${pageInfo.redirectedFrom}`);
        }
        if (parts.length > 0) {
          changes.sourceDetail = parts.join(", ");
        }

        // Check if another visit in this trail already has the actual title
        // (happens when the same page is reached via different redirects,
        // e.g. /wiki/Sahabah and /wiki/Companions_of_Muhammad both → "Companions of the Prophet")
        if (actualTitle !== capturedTitle) {
          const existingByTitle = await data.findVisitByUrl(capturedTrailId, "", actualTitle);
          if (existingByTitle) {
            // This visit is a duplicate — find the one we just created and delete it
            const duplicate = await data.findVisitByUrl(capturedTrailId, capturedUrl);
            if (duplicate && duplicate.id !== existingByTitle.id) {
              const now = new Date().toISOString();
              await data.updateVisit(existingByTitle.id, { lastVisitedAt: now });
              await data.softDeleteVisit(duplicate.id);
              return;
            }
          }
        }

        if (Object.keys(changes).length > 0) {
          const visitToUpdate = await data.findVisitByUrl(capturedTrailId, capturedUrl);
          if (visitToUpdate) {
            await data.updateVisit(visitToUpdate.id, changes);
          }
        }
      }
    } catch {
      // Content script not ready or tab closed — ignore
    }
  }, 1500);
}
