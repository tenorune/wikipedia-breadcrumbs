import { describe, it, expect } from "vitest";
import { createTrail } from "../../src/models/trail.js";
import type { Trail } from "../../src/models/trail.js";
import { TrailStatus, Visibility, StartReason, SyncStatus } from "../../src/models/enums.js";

describe("Trail", () => {
  it("createTrail returns a Trail with required fields and defaults", () => {
    const trail = createTrail({
      startReason: StartReason.AutoNewTab,
      deviceId: "device-abc",
    });
    expect(trail.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(trail.userId).toBeNull();
    expect(trail.name).toBeNull();
    expect(trail.status).toBe(TrailStatus.Active);
    expect(trail.isStarred).toBe(false);
    expect(trail.tags).toEqual([]);
    expect(trail.visibility).toBe(Visibility.Private);
    expect(trail.deviceId).toBe("device-abc");
    expect(trail.forkedFromVisitId).toBeNull();
    expect(trail.startReason).toBe(StartReason.AutoNewTab);
    expect(trail.syncStatus).toBe(SyncStatus.LocalOnly);
    expect(trail.createdAt).toBeDefined();
    expect(trail.startedAt).toBeDefined();
    expect(trail.endedAt).toBeNull();
    expect(trail.deletedAt).toBeNull();
  });

  it("createTrail with forked reason requires forkedFromVisitId", () => {
    const trail = createTrail({
      startReason: StartReason.Forked,
      deviceId: "device-abc",
      forkedFromVisitId: "visit-xyz",
    });
    expect(trail.startReason).toBe(StartReason.Forked);
    expect(trail.forkedFromVisitId).toBe("visit-xyz");
  });

  it("throws if startReason is Forked but forkedFromVisitId is missing", () => {
    expect(() =>
      createTrail({
        startReason: StartReason.Forked,
        deviceId: "device-abc",
      })
    ).toThrow("forkedFromVisitId is required when startReason is forked");
  });

  it("throws if forkedFromVisitId is provided but startReason is not Forked", () => {
    expect(() =>
      createTrail({
        startReason: StartReason.AutoNewTab,
        deviceId: "device-abc",
        forkedFromVisitId: "visit-xyz",
      })
    ).toThrow("forkedFromVisitId must only be set when startReason is forked");
  });

  it("createTrail accepts optional fields", () => {
    const trail = createTrail({
      startReason: StartReason.Manual,
      deviceId: "device-abc",
      name: "My Research Trail",
      userId: "user-123",
      tags: ["history", "science"],
    });
    expect(trail.name).toBe("My Research Trail");
    expect(trail.userId).toBe("user-123");
    expect(trail.tags).toEqual(["history", "science"]);
  });
});
