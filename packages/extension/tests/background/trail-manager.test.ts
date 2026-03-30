import { describe, it, expect, beforeEach } from "vitest";
import { TrailManager, type ActiveTrailEntry } from "../../src/background/trail-manager.js";

describe("TrailManager", () => {
  let manager: TrailManager;
  beforeEach(() => { manager = new TrailManager(); });

  it("setActive stores and retrieves an entry", () => {
    const entry: ActiveTrailEntry = { trailId: "t1", tabId: 42, windowId: 1, lastVisitTimestamp: Date.now(), lastVisitPosition: 1 };
    manager.setActive(42, entry);
    expect(manager.getActive(42)).toEqual(entry);
  });
  it("getActive returns undefined for unknown tab", () => {
    expect(manager.getActive(999)).toBeUndefined();
  });
  it("removeTab clears the entry", () => {
    manager.setActive(42, { trailId: "t1", tabId: 42, windowId: 1, lastVisitTimestamp: Date.now(), lastVisitPosition: 1 });
    manager.removeTab(42);
    expect(manager.getActive(42)).toBeUndefined();
  });
  it("removeByTrailId removes matching entry", () => {
    manager.setActive(42, { trailId: "t1", tabId: 42, windowId: 1, lastVisitTimestamp: Date.now(), lastVisitPosition: 1 });
    manager.setActive(43, { trailId: "t2", tabId: 43, windowId: 1, lastVisitTimestamp: Date.now(), lastVisitPosition: 1 });
    manager.removeByTrailId("t1");
    expect(manager.getActive(42)).toBeUndefined();
    expect(manager.getActive(43)).toBeDefined();
  });
  it("getTabsForWindow returns all tabs in a window", () => {
    manager.setActive(1, { trailId: "t1", tabId: 1, windowId: 10, lastVisitTimestamp: Date.now(), lastVisitPosition: 1 });
    manager.setActive(2, { trailId: "t2", tabId: 2, windowId: 10, lastVisitTimestamp: Date.now(), lastVisitPosition: 1 });
    manager.setActive(3, { trailId: "t3", tabId: 3, windowId: 20, lastVisitTimestamp: Date.now(), lastVisitPosition: 1 });
    expect(manager.getTabsForWindow(10)).toEqual([1, 2]);
    expect(manager.getTabsForWindow(20)).toEqual([3]);
  });
  it("incrementPosition updates and returns new position", () => {
    manager.setActive(42, { trailId: "t1", tabId: 42, windowId: 1, lastVisitTimestamp: Date.now(), lastVisitPosition: 3 });
    const newPos = manager.incrementPosition(42);
    expect(newPos).toBe(4);
    expect(manager.getActive(42)!.lastVisitPosition).toBe(4);
  });
});
