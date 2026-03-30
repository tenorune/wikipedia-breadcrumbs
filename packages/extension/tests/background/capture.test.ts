import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetChromeMock, chromeMock } from "../chrome-mock.js";
import { TrailManager } from "../../src/background/trail-manager.js";
import { handleNavigation } from "../../src/background/capture.js";

vi.mock("../../src/background/offscreen.js", () => ({
  sendToOffscreen: vi.fn(async (msg: any) => {
    if (msg.type === "addTrail") return { success: true, data: msg.trail };
    if (msg.type === "addVisit") return { success: true, data: msg.visit };
    if (msg.type === "getActiveTrailForTab") return { success: true, data: null };
    return { success: true, data: null };
  }),
}));

describe("handleNavigation", () => {
  let trailManager: TrailManager;

  beforeEach(() => {
    resetChromeMock();
    trailManager = new TrailManager();
    chromeMock.tabs.sendMessage.mockResolvedValue({ clickedLinkText: null, referrerUrl: null });
  });

  it("creates new trail and visit for first navigation", async () => {
    const { sendToOffscreen } = await import("../../src/background/offscreen.js");
    await handleNavigation(
      { tabId: 1, url: "https://en.wikipedia.org/wiki/Rust_(programming_language)", frameId: 0, windowId: 1 },
      trailManager, "device-1", 30
    );
    expect(sendToOffscreen).toHaveBeenCalledWith(expect.objectContaining({ type: "addTrail" }));
    expect(sendToOffscreen).toHaveBeenCalledWith(expect.objectContaining({ type: "addVisit" }));
    expect(trailManager.getActive(1)).toBeDefined();
  });

  it("skips non-Wikipedia URLs", async () => {
    const { sendToOffscreen } = await import("../../src/background/offscreen.js");
    await handleNavigation(
      { tabId: 1, url: "https://google.com", frameId: 0, windowId: 1 },
      trailManager, "device-1", 30
    );
    expect(sendToOffscreen).not.toHaveBeenCalled();
  });

  it("skips sub-frames", async () => {
    const { sendToOffscreen } = await import("../../src/background/offscreen.js");
    await handleNavigation(
      { tabId: 1, url: "https://en.wikipedia.org/wiki/Test", frameId: 1, windowId: 1 },
      trailManager, "device-1", 30
    );
    expect(sendToOffscreen).not.toHaveBeenCalled();
  });

  it("appends visit to existing trail in same tab", async () => {
    await handleNavigation(
      { tabId: 1, url: "https://en.wikipedia.org/wiki/Rust_(programming_language)", frameId: 0, windowId: 1 },
      trailManager, "device-1", 30
    );
    chromeMock.tabs.sendMessage.mockResolvedValue({ clickedLinkText: "Cargo", referrerUrl: "https://en.wikipedia.org/wiki/Rust_(programming_language)" });
    await handleNavigation(
      { tabId: 1, url: "https://en.wikipedia.org/wiki/Cargo_(Rust)", frameId: 0, windowId: 1 },
      trailManager, "device-1", 30
    );
    const entry = trailManager.getActive(1);
    expect(entry!.lastVisitPosition).toBe(2);
  });
});
