import { describe, it, expect } from "vitest";
import { createVisit } from "../../src/models/visit.js";
import type { Visit } from "../../src/models/visit.js";
import { SourceType, SyncStatus } from "../../src/models/enums.js";

describe("Visit", () => {
  it("createVisit returns a Visit with required fields and defaults", () => {
    const visit = createVisit({
      trailId: "trail-123",
      url: "https://en.wikipedia.org/wiki/Rust_(programming_language)",
      title: "Rust (programming language)",
      position: 1,
      sourceType: SourceType.Link,
      language: "en",
      articleId: "46765424",
    });
    expect(visit.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(visit.trailId).toBe("trail-123");
    expect(visit.url).toBe("https://en.wikipedia.org/wiki/Rust_(programming_language)");
    expect(visit.title).toBe("Rust (programming language)");
    expect(visit.position).toBe(1);
    expect(visit.sourceType).toBe(SourceType.Link);
    expect(visit.language).toBe("en");
    expect(visit.articleId).toBe("46765424");
    expect(visit.syncStatus).toBe(SyncStatus.LocalOnly);
    expect(visit.timestamp).toBeDefined();
    expect(visit.updatedAt).toBeDefined();
    expect(visit.sourceDetail).toBeNull();
    expect(visit.tabId).toBeNull();
    expect(visit.windowId).toBeNull();
    expect(visit.note).toBeNull();
    expect(visit.summary).toBeNull();
    expect(visit.thumbnailUrl).toBeNull();
    expect(visit.deletedAt).toBeNull();
  });

  it("createVisit accepts optional fields", () => {
    const visit = createVisit({
      trailId: "trail-123",
      url: "https://en.wikipedia.org/wiki/Rust_(programming_language)",
      title: "Rust (programming language)",
      position: 1,
      sourceType: SourceType.Search,
      language: "en",
      articleId: "46765424",
      sourceDetail: "rust programming",
      tabId: 42,
      windowId: 1,
      note: "Interesting article",
    });
    expect(visit.sourceDetail).toBe("rust programming");
    expect(visit.tabId).toBe(42);
    expect(visit.windowId).toBe(1);
    expect(visit.note).toBe("Interesting article");
  });
});
