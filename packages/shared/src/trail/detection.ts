import { StartReason } from "../models/enums.js";

export interface TrailDetectionContext {
  currentTrailTabId: number | null;
  currentTrailWindowId: number | null;
  newTabId: number;
  newWindowId: number;
  isNewTab: boolean;
  transitionType: string;
  referrerUrl: string | null;
  newUrl: string;
  msSinceLastVisit: number;
  idleTimeoutMs: number;
  isMainPage: boolean;
  isFromSearch: boolean;
}

type DetectionResult = { isNew: false } | { isNew: true; reason: StartReason };

function isExternalReferrer(referrerUrl: string | null): boolean {
  if (!referrerUrl) return false;
  try { return !new URL(referrerUrl).hostname.endsWith("wikipedia.org"); }
  catch { return false; }
}

// Note: `manual` and `forked` start reasons are not returned by this function.
// They are explicit user actions handled by the caller (extension UI / PWA).
export function shouldStartNewTrail(context: TrailDetectionContext): DetectionResult {
  if (context.currentTrailTabId === null) return { isNew: true, reason: StartReason.AutoNewTab };
  if (context.newTabId !== context.currentTrailTabId) return { isNew: true, reason: StartReason.AutoNewTab };
  if (context.isNewTab) return { isNew: true, reason: StartReason.AutoNewTab };
  if (context.msSinceLastVisit >= context.idleTimeoutMs) return { isNew: true, reason: StartReason.AutoTimeout };
  if (isExternalReferrer(context.referrerUrl) && context.transitionType !== "link") return { isNew: true, reason: StartReason.AutoExternal };
  return { isNew: false };
}
