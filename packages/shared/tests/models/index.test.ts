import { describe, it, expect } from "vitest";
import { SourceType, SyncStatus, TrailStatus, Visibility, StartReason, CitationFormat, createVisit, createTrail } from "../../src/models/index.js";
import type { Visit, Trail, User, ConflictLog } from "../../src/models/index.js";

describe("models index", () => {
  it("re-exports all enums", () => {
    expect(SourceType.Link).toBe("link");
    expect(SyncStatus.LocalOnly).toBe("local_only");
    expect(TrailStatus.Active).toBe("active");
    expect(Visibility.Private).toBe("private");
    expect(StartReason.Manual).toBe("manual");
    expect(CitationFormat.APA).toBe("apa");
  });
  it("re-exports factory functions", () => {
    expect(typeof createVisit).toBe("function");
    expect(typeof createTrail).toBe("function");
  });
});
