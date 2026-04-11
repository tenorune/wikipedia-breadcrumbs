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
  | { type: "signInWithGoogleViaTab" }
  | { type: "signInWithWikimedia" }
  | { type: "signInWithEmail"; email: string; password: string }
  | { type: "signUpWithEmail"; email: string; password: string }
  | { type: "signOut" }
  | { type: "getAuthStatus" }
  | { type: "reinitSync" };

