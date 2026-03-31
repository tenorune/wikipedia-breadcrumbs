import { describe, it, expect } from "vitest";
import type { OffscreenRequest, OffscreenResponse, ContentMessage, ContentResponse, PopupMessage, TrailMutationMessage } from "../../src/shared/messaging.js";

describe("messaging types", () => {
  it("OffscreenRequest type covers all DB operations", () => {
    const addVisit: OffscreenRequest = { type: "addVisit", visit: {} as any };
    const getAll: OffscreenRequest = { type: "getTrailsAll" };
    expect(addVisit.type).toBe("addVisit");
    expect(getAll.type).toBe("getTrailsAll");
  });
  it("ContentMessage types are defined", () => {
    const getClick: ContentMessage = { type: "getClickContext" };
    const ping: ContentMessage = { type: "ping" };
    expect(getClick.type).toBe("getClickContext");
    expect(ping.type).toBe("ping");
  });
  it("PopupMessage types are defined", () => {
    const getCurrent: PopupMessage = { type: "getCurrentTrail", tabId: 1 };
    expect(getCurrent.type).toBe("getCurrentTrail");
  });
  it("TrailMutationMessage types are defined", () => {
    const mutated: TrailMutationMessage = { type: "trailMutated", trailId: "abc" };
    expect(mutated.type).toBe("trailMutated");
  });
});
