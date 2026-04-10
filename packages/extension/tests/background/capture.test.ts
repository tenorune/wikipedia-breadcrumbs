import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetChromeMock, chromeMock } from "../chrome-mock.js";
import { TrailManager } from "../../src/background/trail-manager.js";
import { handleNavigation, type NavigationDetails } from "../../src/background/capture.js";

vi.mock("../../src/background/data-layer.js", () => ({
  addTrail: vi.fn(async (trail: any) => trail),
  addVisit: vi.fn(async (visit: any) => visit),
  getActiveTrailForTab: vi.fn(async () => null),
  getActiveTrailByUrl: vi.fn(async () => null),
  finalizeTrail: vi.fn(async () => undefined),
  findVisitByUrl: vi.fn(async () => null),
  updateTrail: vi.fn(async () => undefined),
  updateVisit: vi.fn(async () => undefined),
  softDeleteVisit: vi.fn(async () => undefined),
}));

function nav(overrides: Partial<NavigationDetails> = {}): NavigationDetails {
  return {
    tabId: 1,
    url: "https://en.wikipedia.org/wiki/Rust_(programming_language)",
    frameId: 0,
    windowId: 1,
    transitionType: "link",
    transitionQualifiers: [],
    clickedLinkText: null,
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
    const dataLayer = await import("../../src/background/data-layer.js");
    await handleNavigation(nav(), trailManager, "device-1", 30);
    expect(dataLayer.addTrail).toHaveBeenCalled();
    expect(dataLayer.addVisit).toHaveBeenCalled();
    expect(trailManager.getActive(1)).toBeDefined();
  });

  it("skips non-Wikipedia URLs", async () => {
    const dataLayer = await import("../../src/background/data-layer.js");
    await handleNavigation(nav({ url: "https://google.com" }), trailManager, "device-1", 30);
    expect(dataLayer.addTrail).not.toHaveBeenCalled();
  });

  it("skips sub-frames", async () => {
    const dataLayer = await import("../../src/background/data-layer.js");
    await handleNavigation(nav({ frameId: 1 }), trailManager, "device-1", 30);
    expect(dataLayer.addTrail).not.toHaveBeenCalled();
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
    const dataLayer = await import("../../src/background/data-layer.js");
    await handleNavigation(nav({ transitionType: "link" }), trailManager, "device-1", 30);
    const visitCall = (dataLayer.addVisit as any).mock.calls.find(
      (c: any) => c[0].sourceType === "link"
    );
    expect(visitCall).toBeDefined();
  });

  it("sets sourceType to External for typed transitions", async () => {
    const dataLayer = await import("../../src/background/data-layer.js");
    await handleNavigation(nav({ transitionType: "typed" }), trailManager, "device-1", 30);
    const visitCall = (dataLayer.addVisit as any).mock.calls.find(
      (c: any) => c[0].sourceType === "external"
    );
    expect(visitCall).toBeDefined();
  });

  it("sets sourceType to Search for generated transitions", async () => {
    const dataLayer = await import("../../src/background/data-layer.js");
    await handleNavigation(nav({ transitionType: "generated" }), trailManager, "device-1", 30);
    const visitCall = (dataLayer.addVisit as any).mock.calls.find(
      (c: any) => c[0].sourceType === "search"
    );
    expect(visitCall).toBeDefined();
  });

  it("sets sourceDetail for address bar navigation", async () => {
    const dataLayer = await import("../../src/background/data-layer.js");
    await handleNavigation(
      nav({ transitionType: "typed", transitionQualifiers: ["from_address_bar"] }),
      trailManager, "device-1", 30
    );
    const visitCall = (dataLayer.addVisit as any).mock.calls.find(
      (c: any) => c[0].sourceDetail === "address bar"
    );
    expect(visitCall).toBeDefined();
  });
});
