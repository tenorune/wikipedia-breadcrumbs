import { describe, it, expect, vi, beforeEach } from "vitest";
import { SupabaseBackend } from "../../src/sync/supabase-backend.js";
import { createTrail, createVisit, StartReason, SourceType, SyncStatus } from "../../src/models/index.js";

function mockSupabase() {
  const upsertFn = vi.fn().mockResolvedValue({ data: [], error: null });
  const selectFn = vi.fn().mockReturnValue({
    gt: vi.fn().mockResolvedValue({ data: [], error: null }),
  });
  const from = vi.fn().mockReturnValue({ upsert: upsertFn, select: selectFn });
  return { from, upsertFn, selectFn };
}

describe("SupabaseBackend", () => {
  let mock: ReturnType<typeof mockSupabase>;
  let backend: SupabaseBackend;

  beforeEach(() => {
    mock = mockSupabase();
    backend = new SupabaseBackend(mock as any, "user-123");
  });

  it("pushTrails upserts trails with snake_case fields", async () => {
    const trail = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    trail.userId = "user-123";
    const results = await backend.pushTrails([trail]);
    expect(mock.from).toHaveBeenCalledWith("trails");
    expect(mock.upsertFn).toHaveBeenCalled();
    const upsertArg = mock.upsertFn.mock.calls[0][0];
    expect(upsertArg).toHaveProperty("start_reason", "auto_new_tab");
    expect(upsertArg).not.toHaveProperty("syncStatus");
    expect(upsertArg).not.toHaveProperty("sync_status");
    expect(results[0].success).toBe(true);
  });

  it("pushVisits upserts visits with snake_case and injects user_id", async () => {
    const visit = createVisit({
      trailId: "t1", url: "https://en.wikipedia.org/wiki/Test",
      title: "Test", position: 1, sourceType: SourceType.Link,
      language: "en", articleId: "Test",
    });
    const results = await backend.pushVisits([visit]);
    expect(mock.from).toHaveBeenCalledWith("visits");
    const upsertArg = mock.upsertFn.mock.calls[0][0];
    expect(upsertArg).toHaveProperty("user_id", "user-123");
    expect(upsertArg).toHaveProperty("trail_id", "t1");
    expect(results[0].success).toBe(true);
  });

  it("pullTrails returns trails mapped to camelCase with synced status", async () => {
    const remoteTrail = {
      id: "t1", user_id: "user-123", name: null,
      created_at: "2026-01-01", started_at: "2026-01-01",
      ended_at: null, status: "active", is_starred: false,
      tags: [], note: null, visibility: "private",
      device_id: "d1", forked_from_visit_id: null,
      start_reason: "auto_new_tab", updated_at: "2026-01-01",
      deleted_at: null,
    };
    mock.selectFn.mockReturnValue({
      gt: vi.fn().mockResolvedValue({ data: [remoteTrail], error: null }),
    });
    const trails = await backend.pullTrails("2025-01-01");
    expect(trails).toHaveLength(1);
    expect(trails[0]).toHaveProperty("userId", "user-123");
    expect(trails[0]).toHaveProperty("startReason", "auto_new_tab");
    expect(trails[0]).toHaveProperty("isStarred", false);
    expect(trails[0]).toHaveProperty("syncStatus", "synced");
  });

  it("handles upsert errors gracefully", async () => {
    mock.upsertFn.mockResolvedValue({ data: null, error: { message: "RLS violation" } });
    const trail = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    const results = await backend.pushTrails([trail]);
    expect(results[0].success).toBe(false);
    expect(results[0].error).toContain("RLS violation");
  });
});
