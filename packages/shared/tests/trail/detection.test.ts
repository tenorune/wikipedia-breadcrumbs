import { describe, it, expect } from "vitest";
import { shouldStartNewTrail, type TrailDetectionContext } from "../../src/trail/detection.js";
import { StartReason } from "../../src/models/enums.js";

const baseContext: TrailDetectionContext = {
  currentTrailTabId: 1, currentTrailWindowId: 1,
  newTabId: 1, newWindowId: 1,
  isNewTab: false, transitionType: "link",
  referrerUrl: "https://en.wikipedia.org/wiki/Foo",
  newUrl: "https://en.wikipedia.org/wiki/Bar",
  msSinceLastVisit: 1000, idleTimeoutMs: 30 * 60 * 1000,
  isMainPage: false, isFromSearch: false,
};

function ctx(overrides: Partial<TrailDetectionContext>): TrailDetectionContext {
  return { ...baseContext, ...overrides };
}

describe("shouldStartNewTrail", () => {
  it("continues trail for normal link navigation in same tab", () => {
    expect(shouldStartNewTrail(baseContext)).toEqual({ isNew: false });
  });
  it("starts new trail for a new tab", () => {
    expect(shouldStartNewTrail(ctx({ isNewTab: true }))).toEqual({ isNew: true, reason: StartReason.AutoNewTab });
  });
  it("starts new trail after idle timeout", () => {
    expect(shouldStartNewTrail(ctx({ msSinceLastVisit: 31 * 60 * 1000 }))).toEqual({ isNew: true, reason: StartReason.AutoTimeout });
  });
  it("does not start new trail just before timeout", () => {
    expect(shouldStartNewTrail(ctx({ msSinceLastVisit: 29 * 60 * 1000 }))).toEqual({ isNew: false });
  });
  it("starts new trail for external referrer", () => {
    expect(shouldStartNewTrail(ctx({ referrerUrl: "https://google.com/search?q=test", transitionType: "typed" }))).toEqual({ isNew: true, reason: StartReason.AutoExternal });
  });
  it("continues trail for same-tab Wikipedia search", () => {
    expect(shouldStartNewTrail(ctx({ isFromSearch: true }))).toEqual({ isNew: false });
  });
  it("continues trail for same-tab Main Page visit", () => {
    expect(shouldStartNewTrail(ctx({ isMainPage: true }))).toEqual({ isNew: false });
  });
  it("starts new trail when no current trail exists (null tab)", () => {
    expect(shouldStartNewTrail(ctx({ currentTrailTabId: null, currentTrailWindowId: null }))).toEqual({ isNew: true, reason: StartReason.AutoNewTab });
  });
  it("starts new trail when tab differs from current trail", () => {
    expect(shouldStartNewTrail(ctx({ newTabId: 99 }))).toEqual({ isNew: true, reason: StartReason.AutoNewTab });
  });
  it("respects custom idle timeout", () => {
    expect(shouldStartNewTrail(ctx({ msSinceLastVisit: 11 * 60 * 1000, idleTimeoutMs: 10 * 60 * 1000 }))).toEqual({ isNew: true, reason: StartReason.AutoTimeout });
  });
});
