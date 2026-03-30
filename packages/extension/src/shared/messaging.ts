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
  | { type: "getActiveTrails" };

export type OffscreenResponse<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string };

export type ContentMessage = { type: "getClickContext" } | { type: "ping" };
export type ContentResponse = { clickedLinkText: string | null; referrerUrl: string | null } | { pong: true };

export type PopupMessage =
  | { type: "getCurrentTrail"; tabId: number }
  | { type: "startNewTrail"; tabId: number }
  | { type: "endTrail"; trailId: string }
  | { type: "renameTrail"; trailId: string; name: string };

export type TrailMutationMessage =
  | { type: "trailMutated"; trailId: string }
  | { type: "trailDeleted"; trailId: string };

export type BackgroundMessage = PopupMessage | TrailMutationMessage;

export interface OffscreenEnvelope {
  target: "offscreen";
  request: OffscreenRequest;
}
