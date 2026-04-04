import { describe, it, expect } from "vitest";
import { isWikipediaUrl, parseWikipediaUrl, cleanWikipediaUrl } from "../../src/wikipedia/url-parser.js";

describe("isWikipediaUrl", () => {
  it("returns true for standard Wikipedia article URLs", () => {
    expect(isWikipediaUrl("https://en.wikipedia.org/wiki/Rust_(programming_language)")).toBe(true);
    expect(isWikipediaUrl("https://fr.wikipedia.org/wiki/Paris")).toBe(true);
    expect(isWikipediaUrl("https://ja.wikipedia.org/wiki/東京")).toBe(true);
  });
  it("returns true for Simple English Wikipedia", () => {
    expect(isWikipediaUrl("https://simple.wikipedia.org/wiki/Rust")).toBe(true);
  });
  it("returns true for mobile Wikipedia URLs", () => {
    expect(isWikipediaUrl("https://en.m.wikipedia.org/wiki/Rust_(programming_language)")).toBe(true);
  });
  it("returns false for non-Wikipedia URLs", () => {
    expect(isWikipediaUrl("https://google.com")).toBe(false);
    expect(isWikipediaUrl("https://en.wiktionary.org/wiki/rust")).toBe(false);
  });
  it("returns false for Wikipedia non-article pages", () => {
    expect(isWikipediaUrl("https://en.wikipedia.org/wiki/Special:Search")).toBe(false);
    expect(isWikipediaUrl("https://en.wikipedia.org/wiki/Wikipedia:About")).toBe(false);
    expect(isWikipediaUrl("https://en.wikipedia.org/wiki/Help:Contents")).toBe(false);
    expect(isWikipediaUrl("https://en.wikipedia.org/wiki/Talk:Rust")).toBe(false);
    expect(isWikipediaUrl("https://en.wikipedia.org/wiki/User:Example")).toBe(false);
    expect(isWikipediaUrl("https://en.wikipedia.org/wiki/Category:Programming_languages")).toBe(false);
  });
  it("returns false for localized non-article pages", () => {
    expect(isWikipediaUrl("https://de.wikipedia.org/wiki/Diskussion:Zucker")).toBe(false);
    expect(isWikipediaUrl("https://fr.wikipedia.org/wiki/Discussion:Paris")).toBe(false);
    expect(isWikipediaUrl("https://de.wikipedia.org/wiki/Benutzer:Example")).toBe(false);
    expect(isWikipediaUrl("https://fr.wikipedia.org/wiki/Catégorie:Informatique")).toBe(false);
    expect(isWikipediaUrl("https://de.wikipedia.org/wiki/Spezial:Suche")).toBe(false);
    expect(isWikipediaUrl("https://en.wikipedia.org/wiki/User_talk:Example")).toBe(false);
  });
  it("returns true for Wikipedia Main Page", () => {
    expect(isWikipediaUrl("https://en.wikipedia.org/wiki/Main_Page")).toBe(true);
  });
});

describe("parseWikipediaUrl", () => {
  it("extracts language, title, and cleaned URL from a standard URL", () => {
    const result = parseWikipediaUrl("https://en.wikipedia.org/wiki/Rust_(programming_language)");
    expect(result).toEqual({
      language: "en",
      title: "Rust (programming language)",
      cleanUrl: "https://en.wikipedia.org/wiki/Rust_(programming_language)",
    });
  });
  it("extracts language from non-English wikis", () => {
    const result = parseWikipediaUrl("https://fr.wikipedia.org/wiki/Paris");
    expect(result).toEqual({ language: "fr", title: "Paris", cleanUrl: "https://fr.wikipedia.org/wiki/Paris" });
  });
  it("normalizes mobile URLs to desktop", () => {
    const result = parseWikipediaUrl("https://en.m.wikipedia.org/wiki/Rust_(programming_language)");
    expect(result).toEqual({
      language: "en",
      title: "Rust (programming language)",
      cleanUrl: "https://en.wikipedia.org/wiki/Rust_(programming_language)",
    });
  });
  it("strips query parameters and fragments", () => {
    const result = parseWikipediaUrl("https://en.wikipedia.org/wiki/Rust_(programming_language)?action=edit#History");
    expect(result).toEqual({
      language: "en",
      title: "Rust (programming language)",
      cleanUrl: "https://en.wikipedia.org/wiki/Rust_(programming_language)",
    });
  });
  it("decodes percent-encoded titles", () => {
    const result = parseWikipediaUrl("https://en.wikipedia.org/wiki/Caf%C3%A9");
    expect(result).toEqual({
      language: "en",
      title: "Café",
      cleanUrl: "https://en.wikipedia.org/wiki/Caf%C3%A9",
    });
  });
  it("replaces underscores with spaces in title", () => {
    const result = parseWikipediaUrl("https://en.wikipedia.org/wiki/United_States");
    expect(result).toEqual({ language: "en", title: "United States", cleanUrl: "https://en.wikipedia.org/wiki/United_States" });
  });
  it("returns null for non-Wikipedia URLs", () => {
    expect(parseWikipediaUrl("https://google.com")).toBeNull();
  });
  it("returns null for non-article pages", () => {
    expect(parseWikipediaUrl("https://en.wikipedia.org/wiki/Special:Search")).toBeNull();
  });
  it("handles Main_Page", () => {
    const result = parseWikipediaUrl("https://en.wikipedia.org/wiki/Main_Page");
    expect(result).toEqual({ language: "en", title: "Main Page", cleanUrl: "https://en.wikipedia.org/wiki/Main_Page" });
  });
});

describe("cleanWikipediaUrl", () => {
  it("removes query params and fragments", () => {
    expect(cleanWikipediaUrl("https://en.wikipedia.org/wiki/Rust_(programming_language)?oldid=123#section"))
      .toBe("https://en.wikipedia.org/wiki/Rust_(programming_language)");
  });
  it("converts mobile to desktop", () => {
    expect(cleanWikipediaUrl("https://en.m.wikipedia.org/wiki/Rust_(programming_language)"))
      .toBe("https://en.wikipedia.org/wiki/Rust_(programming_language)");
  });
  it("returns the URL unchanged if already clean", () => {
    expect(cleanWikipediaUrl("https://en.wikipedia.org/wiki/Rust_(programming_language)"))
      .toBe("https://en.wikipedia.org/wiki/Rust_(programming_language)");
  });
});
