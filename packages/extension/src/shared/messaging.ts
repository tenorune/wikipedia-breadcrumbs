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
  | { type: "softDeleteVisit"; visitId: string }
  | { type: "searchVisits"; query: string }
  | { type: "getActiveTrails" }
  | { type: "findVisitByUrl"; trailId: string; url: string; title?: string }
  | { type: "getActiveTrailByUrl"; url: string }
  | { type: "enableSync" }
  | { type: "disableSync" }
  | { type: "syncNow" }
  | { type: "getSyncStatus" }
  | { type: "signInWithGoogle"; idToken: string; nonce: string }
  | { type: "signInWithEmail"; email: string; password: string }
  | { type: "signUpWithEmail"; email: string; password: string }
  | { type: "signOut" }
  | { type: "getAuthStatus" }
  | { type: "reinitSync" };

export type OffscreenResponse<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string };

export type ContentMessage = { type: "getClickContext" } | { type: "getPageInfo" } | { type: "ping" };
export type ContentResponse =
  | { clickedLinkText: string | null; referrerUrl: string | null }
  | { pageTitle: string; redirectedFrom: string | null }
  | { pong: true };

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
  | { type: "syncComplete"; completedAt: string }
  | { type: "signInWithGoogle"; idToken: string; nonce: string }
  | { type: "signInWithEmail"; email: string; password: string }
  | { type: "signUpWithEmail"; email: string; password: string }
  | { type: "signOut" }
  | { type: "getAuthStatus" }
  | { type: "reinitSync" };

export interface OffscreenEnvelope {
  target: "offscreen";
  request: OffscreenRequest;
}
