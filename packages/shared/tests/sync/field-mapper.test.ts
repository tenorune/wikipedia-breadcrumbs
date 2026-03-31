import { describe, it, expect } from "vitest";
import { toSnakeCase, toCamelCase, mapToRemote, mapToLocal } from "../../src/sync/field-mapper.js";

describe("field-mapper", () => {
  it("toSnakeCase converts camelCase keys", () => {
    expect(toSnakeCase("trailId")).toBe("trail_id");
    expect(toSnakeCase("lastVisitedAt")).toBe("last_visited_at");
    expect(toSnakeCase("isStarred")).toBe("is_starred");
    expect(toSnakeCase("url")).toBe("url");
    expect(toSnakeCase("thumbnailUrl")).toBe("thumbnail_url");
  });
  it("toCamelCase converts snake_case keys", () => {
    expect(toCamelCase("trail_id")).toBe("trailId");
    expect(toCamelCase("last_visited_at")).toBe("lastVisitedAt");
    expect(toCamelCase("is_starred")).toBe("isStarred");
    expect(toCamelCase("url")).toBe("url");
  });
  it("mapToRemote converts object keys to snake_case and strips syncStatus", () => {
    const local = { id: "abc", trailId: "t1", lastVisitedAt: "2026-01-01", syncStatus: "pending_sync" };
    const remote = mapToRemote(local);
    expect(remote).toEqual({ id: "abc", trail_id: "t1", last_visited_at: "2026-01-01" });
    expect(remote).not.toHaveProperty("sync_status");
    expect(remote).not.toHaveProperty("syncStatus");
  });
  it("mapToLocal converts object keys to camelCase", () => {
    const remote = { id: "abc", trail_id: "t1", last_visited_at: "2026-01-01" };
    const local = mapToLocal(remote);
    expect(local).toEqual({ id: "abc", trailId: "t1", lastVisitedAt: "2026-01-01" });
  });
});
