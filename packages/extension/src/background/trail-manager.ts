export interface ActiveTrailEntry {
  trailId: string;
  tabId: number;
  windowId: number;
  lastVisitTimestamp: number;
  lastVisitPosition: number;
}

export class TrailManager {
  private activeTrails = new Map<number, ActiveTrailEntry>();

  setActive(tabId: number, entry: ActiveTrailEntry): void {
    this.activeTrails.set(tabId, entry);
  }
  getActive(tabId: number): ActiveTrailEntry | undefined {
    return this.activeTrails.get(tabId);
  }
  removeTab(tabId: number): void {
    this.activeTrails.delete(tabId);
  }
  removeByTrailId(trailId: string): void {
    for (const [tabId, entry] of this.activeTrails) {
      if (entry.trailId === trailId) this.activeTrails.delete(tabId);
    }
  }
  getTabsForWindow(windowId: number): number[] {
    const tabs: number[] = [];
    for (const [tabId, entry] of this.activeTrails) {
      if (entry.windowId === windowId) tabs.push(tabId);
    }
    return tabs;
  }
  incrementPosition(tabId: number): number {
    const entry = this.activeTrails.get(tabId);
    if (!entry) throw new Error(`No active trail for tab ${tabId}`);
    entry.lastVisitPosition += 1;
    entry.lastVisitTimestamp = Date.now();
    return entry.lastVisitPosition;
  }
}
