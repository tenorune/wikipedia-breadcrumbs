import type { Visit, Trail } from "@wikipedia-breadcrumbs/shared";

export type OffscreenRequest =
  | { type: "addVisit"; visit: Visit }
  | { type: "addTrail"; trail: Trail }
  | { type: "finalizeTrail"; trailId: string }
  | { type: "getActiveTrailForTab"; tabId: number }
  | { type: "getTrailsAll" }
  | { type: "getTrailById"; trailId: string }
  | { type: "getVisitsByTrailId"; trailId: string }
  | { type: "updateTrail"; trailId: string; changes: Partial<Trail> }
  | { type: "updateVisit"; visitId: string; changes: Partial<Visit> }
  | { type: "softDeleteTrail"; trailId: string }
  | { type: "searchVisits"; query: string }
  | { type: "getActiveTrails" }
  | { type: "findVisitByUrl"; trailId: string; url: string }
  | { type: "getActiveTrailByUrl"; url: string }
  | { type: "enableSync" }
  | { type: "disableSync" }
  | { type: "syncNow" }
  | { type: "getSyncStatus" };

export type OffscreenResponse<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string };

export type ContentMessage = { type: "getClickContext" } | { type: "ping" };
export type ContentResponse = { clickedLinkText: string | null; referrerUrl: string | null } | { pong: true };

export type PopupMessage =
  | { type: "getCurrentTrail"; tabId: number }
  | { type: "startNewTrail"; tabId: number }
  | { type: "endTrail"; trailId: string }
  | { type: "renameTrail"; trailId: string; name: string }
  | { type: "resumeTrailInNewTab"; trailId: string; url: string }
  | { type: "navigateActiveTrail"; trailId: string; url: string };

export type TrailMutationMessage =
  | { type: "trailMutated"; trailId: string }
  | { type: "trailDeleted"; trailId: string };

export type BackgroundMessage = PopupMessage | TrailMutationMessage
  | { type: "getSyncStatus" }
  | { type: "syncNow" }
  | { type: "enableSync" }
  | { type: "disableSync" }
  | { type: "syncComplete"; completedAt: string };

export interface OffscreenEnvelope {
  target: "offscreen";
  request: OffscreenRequest;
}
