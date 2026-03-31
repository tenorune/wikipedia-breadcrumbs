import { describe, it, expect } from "vitest";
import { SourceType, SyncStatus, TrailStatus, Visibility, StartReason, CitationFormat } from "../../src/models/enums.js";

describe("enums", () => {
  it("SourceType has all expected values", () => {
    expect(SourceType.Link).toBe("link");
    expect(SourceType.Search).toBe("search");
    expect(SourceType.External).toBe("external");
    expect(SourceType.Manual).toBe("manual");
    expect(SourceType.ShareTarget).toBe("share_target");
  });
  it("SyncStatus has all expected values", () => {
    expect(SyncStatus.LocalOnly).toBe("local_only");
    expect(SyncStatus.Synced).toBe("synced");
    expect(SyncStatus.PendingSync).toBe("pending_sync");
  });
  it("TrailStatus has all expected values", () => {
    expect(TrailStatus.Active).toBe("active");
    expect(TrailStatus.Finalized).toBe("finalized");
  });
  it("Visibility has all expected values", () => {
    expect(Visibility.Private).toBe("private");
    expect(Visibility.Unlisted).toBe("unlisted");
    expect(Visibility.Public).toBe("public");
  });
  it("StartReason has all expected values", () => {
    expect(StartReason.AutoNewTab).toBe("auto_new_tab");
    expect(StartReason.AutoTimeout).toBe("auto_timeout");
    expect(StartReason.AutoExternal).toBe("auto_external");
    expect(StartReason.AutoSearch).toBe("auto_search");
    expect(StartReason.AutoMainPage).toBe("auto_main_page");
    expect(StartReason.Manual).toBe("manual");
    expect(StartReason.Forked).toBe("forked");
  });
  it("CitationFormat has all expected values", () => {
    expect(CitationFormat.Wikipedia).toBe("wikipedia");
    expect(CitationFormat.APA).toBe("apa");
    expect(CitationFormat.MLA).toBe("mla");
    expect(CitationFormat.Chicago).toBe("chicago");
    expect(CitationFormat.BibTeX).toBe("bibtex");
    expect(CitationFormat.URL).toBe("url");
    expect(CitationFormat.Markdown).toBe("markdown");
  });
});
