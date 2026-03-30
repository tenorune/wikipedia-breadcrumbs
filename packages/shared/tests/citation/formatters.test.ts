import { describe, it, expect } from "vitest";
import { formatCitation } from "../../src/citation/formatters.js";
import { CitationFormat } from "../../src/models/enums.js";
import type { Visit } from "../../src/models/visit.js";

const visit: Pick<Visit, "url" | "title" | "timestamp" | "language" | "articleId"> = {
  url: "https://en.wikipedia.org/wiki/Rust_(programming_language)",
  title: "Rust (programming language)",
  timestamp: "2026-03-15T10:30:00.000Z",
  language: "en",
  articleId: "46765424",
};

describe("formatCitation", () => {
  it("formats Wikipedia citation template", () => {
    const result = formatCitation(visit, CitationFormat.Wikipedia);
    expect(result).toBe(
      '{{cite web |url=https://en.wikipedia.org/wiki/Rust_(programming_language) |title=Rust (programming language) |website=Wikipedia |language=en |access-date=2026-03-15}}'
    );
  });
  it("formats APA", () => {
    const result = formatCitation(visit, CitationFormat.APA);
    expect(result).toBe(
      "Rust (programming language). (2026, March 15). In *Wikipedia*. https://en.wikipedia.org/wiki/Rust_(programming_language)"
    );
  });
  it("formats MLA", () => {
    const result = formatCitation(visit, CitationFormat.MLA);
    expect(result).toBe(
      '"Rust (programming language)." *Wikipedia*, Wikimedia Foundation, 15 Mar. 2026, en.wikipedia.org/wiki/Rust_(programming_language).'
    );
  });
  it("formats Chicago", () => {
    const result = formatCitation(visit, CitationFormat.Chicago);
    expect(result).toBe(
      '"Rust (programming language)," Wikipedia, accessed March 15, 2026, https://en.wikipedia.org/wiki/Rust_(programming_language).'
    );
  });
  it("formats BibTeX", () => {
    const result = formatCitation(visit, CitationFormat.BibTeX);
    expect(result).toContain("@misc{wiki:46765424");
    expect(result).toContain("title = {Rust (programming language)}");
    expect(result).toContain("url = {https://en.wikipedia.org/wiki/Rust_(programming_language)}");
  });
  it("formats plain URL", () => {
    const result = formatCitation(visit, CitationFormat.URL);
    expect(result).toBe("https://en.wikipedia.org/wiki/Rust_(programming_language)");
  });
  it("formats Markdown link", () => {
    const result = formatCitation(visit, CitationFormat.Markdown);
    expect(result).toBe(
      "[Rust (programming language)](https://en.wikipedia.org/wiki/Rust_(programming_language))"
    );
  });
});
