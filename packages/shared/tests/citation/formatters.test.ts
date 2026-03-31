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

  it("formats APA with locale-aware date", () => {
    const result = formatCitation(visit, CitationFormat.APA, "en-US");
    expect(result).toContain("2026");
    expect(result).toContain("March");
    expect(result).toContain("15");
    expect(result).toContain("In *Wikipedia*");
  });

  it("formats MLA with locale-aware date", () => {
    const result = formatCitation(visit, CitationFormat.MLA, "en-US");
    expect(result).toContain("March");
    expect(result).toContain("2026");
    expect(result).toMatch(/^"Rust \(programming language\)\." \*Wikipedia\*/);
    expect(result).toContain("en.wikipedia.org/wiki/Rust_(programming_language)");
  });

  it("formats Chicago with locale-aware date", () => {
    const result = formatCitation(visit, CitationFormat.Chicago, "en-US");
    expect(result).toContain("accessed");
    expect(result).toContain("March");
    expect(result).toContain("2026");
  });

  it("formats dates differently for different locales", () => {
    const enResult = formatCitation(visit, CitationFormat.APA, "en-US");
    const frResult = formatCitation(visit, CitationFormat.APA, "fr-FR");
    // Both should contain the year, but month names differ
    expect(enResult).toContain("March");
    expect(frResult).toContain("mars");
  });

  it("formats BibTeX with ISO date", () => {
    const result = formatCitation(visit, CitationFormat.BibTeX);
    expect(result).toContain("@misc{wiki:46765424");
    expect(result).toContain("title = {Rust (programming language)}");
    expect(result).toContain("url = {https://en.wikipedia.org/wiki/Rust_(programming_language)}");
    expect(result).toContain("Accessed 2026-03-15");
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
