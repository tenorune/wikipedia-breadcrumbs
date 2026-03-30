import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetChromeMock, chromeMock } from "../chrome-mock.js";
import { TrailManager } from "../../src/background/trail-manager.js";
import { handleNavigation, type NavigationDetails } from "../../src/background/capture.js";

vi.mock("../../src/background/offscreen.js", () => ({
  sendToOffscreen: vi.fn(async (msg: any) => {
    if (msg.type === "addTrail") return { success: true, data: msg.trail };
    if (msg.type === "addVisit") return { success: true, data: msg.visit };
    if (msg.type === "getActiveTrailForTab") return { success: true, data: null };
    return { success: true, data: null };
  }),
}));

function nav(overrides: Partial<NavigationDetails> = {}): NavigationDetails {
  return {
    tabId: 1,
    url: "https://en.wikipedia.org/wiki/Rust_(programming_language)",
    frameId: 0,
    windowId: 1,
    transitionType: "link",
    transitionQualifiers: [],
    ...overrides,
  };
}

describe("handleNavigation", () => {
  let trailManager: TrailManager;

  beforeEach(() => {
    resetChromeMock();
    trailManager = new TrailManager();
  });

  it("creates new trail and visit for first navigation", async () => {
    const { sendToOffscreen } = await import("../../src/background/offscreen.js");
    await handleNavigation(nav(), trailManager, "device-1", 30);
    expect(sendToOffscreen).toHaveBeenCalledWith(expect.objectContaining({ type: "addTrail" }));
    expect(sendToOffscreen).toHaveBeenCalledWith(expect.objectContaining({ type: "addVisit" }));
    expect(trailManager.getActive(1)).toBeDefined();
  });

  it("skips non-Wikipedia URLs", async () => {
    const { sendToOffscreen } = await import("../../src/background/offscreen.js");
    await handleNavigation(nav({ url: "https://google.com" }), trailManager, "device-1", 30);
    expect(sendToOffscreen).not.toHaveBeenCalled();
  });

  it("skips sub-frames", async () => {
    const { sendToOffscreen } = await import("../../src/background/offscreen.js");
    await handleNavigation(nav({ frameId: 1 }), trailManager, "device-1", 30);
    expect(sendToOffscreen).not.toHaveBeenCalled();
  });

  it("appends visit to existing trail in same tab", async () => {
    await handleNavigation(nav(), trailManager, "device-1", 30);
    await handleNavigation(
      nav({ url: "https://en.wikipedia.org/wiki/Cargo_(Rust)" }),
      trailManager, "device-1", 30
    );
    const entry = trailManager.getActive(1);
    expect(entry!.lastVisitPosition).toBe(2);
  });

  it("sets sourceType to Link for link transitions", async () => {
    const { sendToOffscreen } = await import("../../src/background/offscreen.js");
    await handleNavigation(nav({ transitionType: "link" }), trailManager, "device-1", 30);
    const visitCall = (sendToOffscreen as any).mock.calls.find(
      (c: any) => c[0].type === "addVisit"
    );
    expect(visitCall[0].visit.sourceType).toBe("link");
  });

  it("sets sourceType to External for typed transitions", async () => {
    const { sendToOffscreen } = await import("../../src/background/offscreen.js");
    await handleNavigation(nav({ transitionType: "typed" }), trailManager, "device-1", 30);
    const visitCall = (sendToOffscreen as any).mock.calls.find(
      (c: any) => c[0].type === "addVisit"
    );
    expect(visitCall[0].visit.sourceType).toBe("external");
  });

  it("sets sourceType to Search for generated transitions", async () => {
    const { sendToOffscreen } = await import("../../src/background/offscreen.js");
    await handleNavigation(nav({ transitionType: "generated" }), trailManager, "device-1", 30);
    const visitCall = (sendToOffscreen as any).mock.calls.find(
      (c: any) => c[0].type === "addVisit"
    );
    expect(visitCall[0].visit.sourceType).toBe("search");
  });

  it("sets sourceDetail for address bar navigation", async () => {
    const { sendToOffscreen } = await import("../../src/background/offscreen.js");
    await handleNavigation(
      nav({ transitionType: "typed", transitionQualifiers: ["from_address_bar"] }),
      trailManager, "device-1", 30
    );
    const visitCall = (sendToOffscreen as any).mock.calls.find(
      (c: any) => c[0].type === "addVisit"
    );
    expect(visitCall[0].visit.sourceDetail).toBe("address bar");
  });
});
