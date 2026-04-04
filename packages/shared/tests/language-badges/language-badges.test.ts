import { describe, it, expect, beforeEach } from "vitest";
import { BreadcrumbsDB } from "../../src/db/schema.js";
import type { LanguageBadgeSettings } from "../../src/db/schema.js";
import {
  getLanguageBadgeSettings,
  saveLanguageBadgeSettings,
  getDistinctLanguages,
  shouldShowLanguageBadge,
  LANGUAGE_NAMES,
} from "../../src/language-badges/index.js";
import { createVisit } from "../../src/models/visit.js";
import { SourceType } from "../../src/models/enums.js";

let db: BreadcrumbsDB;

beforeEach(async () => {
  db = new BreadcrumbsDB("test-lang-badges-" + Date.now());
  await db.open();
});

describe("getLanguageBadgeSettings", () => {
  it("returns defaults when no settings saved", async () => {
    const settings = await getLanguageBadgeSettings(db);
    expect(settings.enabled).toBe(true);
    expect(settings.excludedLanguages).toEqual([]);
  });

  it("auto-excludes first language when no settings saved", async () => {
    const base = { trailId: "t1", position: 1, sourceType: SourceType.Link, articleId: "a" };
    await db.visits.add(createVisit({ ...base, url: "https://en.wikipedia.org/wiki/A", title: "A", language: "en" }));
    await db.visits.add(createVisit({ ...base, url: "https://fr.wikipedia.org/wiki/B", title: "B", language: "fr", position: 2 }));
    const settings = await getLanguageBadgeSettings(db);
    expect(settings.excludedLanguages).toEqual(["en"]);
  });

  it("auto-excludes first language even with unconfigured saved record", async () => {
    const base = { trailId: "t1", position: 1, sourceType: SourceType.Link, articleId: "a" };
    await db.visits.add(createVisit({ ...base, url: "https://en.wikipedia.org/wiki/A", title: "A", language: "en" }));
    await db.languageSettings.put({ id: "default", enabled: true, excludedLanguages: [] });
    const settings = await getLanguageBadgeSettings(db);
    expect(settings.excludedLanguages).toEqual(["en"]);
  });

  it("respects configured settings", async () => {
    const base = { trailId: "t1", position: 1, sourceType: SourceType.Link, articleId: "a" };
    await db.visits.add(createVisit({ ...base, url: "https://en.wikipedia.org/wiki/A", title: "A", language: "en" }));
    await db.languageSettings.put({ id: "default", enabled: true, excludedLanguages: [], configured: true });
    const settings = await getLanguageBadgeSettings(db);
    expect(settings.excludedLanguages).toEqual([]);
  });

  it("returns saved configured settings", async () => {
    await db.languageSettings.put({ id: "default", enabled: true, excludedLanguages: ["en"], configured: true });
    const settings = await getLanguageBadgeSettings(db);
    expect(settings.enabled).toBe(true);
    expect(settings.excludedLanguages).toEqual(["en"]);
  });
});

describe("saveLanguageBadgeSettings", () => {
  it("saves and retrieves settings", async () => {
    await saveLanguageBadgeSettings(db, { id: "default", enabled: true, excludedLanguages: ["en", "es"], configured: true });
    const settings = await getLanguageBadgeSettings(db);
    expect(settings.enabled).toBe(true);
    expect(settings.excludedLanguages).toEqual(["en", "es"]);
  });

  it("overwrites previous settings", async () => {
    await saveLanguageBadgeSettings(db, { id: "default", enabled: true, excludedLanguages: ["en"], configured: true });
    await saveLanguageBadgeSettings(db, { id: "default", enabled: false, excludedLanguages: [], configured: true });
    const settings = await getLanguageBadgeSettings(db);
    expect(settings.enabled).toBe(false);
    expect(settings.excludedLanguages).toEqual([]);
  });
});

describe("getDistinctLanguages", () => {
  it("returns empty result when no visits", async () => {
    const result = await getDistinctLanguages(db);
    expect(result.languages).toEqual([]);
    expect(result.firstLanguage).toBeNull();
  });

  it("returns unique languages ordered by first occurrence", async () => {
    const base = { trailId: "t1", position: 1, sourceType: SourceType.Link, articleId: "a" };
    const v1 = createVisit({ ...base, url: "https://en.wikipedia.org/wiki/A", title: "A", language: "en" });
    v1.timestamp = "2026-01-01T00:00:00.000Z";
    const v2 = createVisit({ ...base, url: "https://fr.wikipedia.org/wiki/B", title: "B", language: "fr", position: 2 });
    v2.timestamp = "2026-01-01T00:01:00.000Z";
    const v3 = createVisit({ ...base, url: "https://en.wikipedia.org/wiki/C", title: "C", language: "en", position: 3 });
    v3.timestamp = "2026-01-01T00:02:00.000Z";
    await db.visits.add(v1);
    await db.visits.add(v2);
    await db.visits.add(v3);
    const result = await getDistinctLanguages(db);
    expect(result.languages).toEqual(["en", "fr"]);
    expect(result.firstLanguage).toBe("en");
  });

  it("excludes soft-deleted visits", async () => {
    const base = { trailId: "t1", position: 1, sourceType: SourceType.Link, articleId: "a" };
    const visit = createVisit({ ...base, url: "https://de.wikipedia.org/wiki/A", title: "A", language: "de" });
    await db.visits.add(visit);
    await db.visits.update(visit.id, { deletedAt: new Date().toISOString() });
    const result = await getDistinctLanguages(db);
    expect(result.languages).toEqual([]);
    expect(result.firstLanguage).toBeNull();
  });
});

describe("shouldShowLanguageBadge", () => {
  it("returns false when disabled", () => {
    const settings: LanguageBadgeSettings = { id: "default", enabled: false, excludedLanguages: [] };
    expect(shouldShowLanguageBadge("fr", settings)).toBe(false);
  });

  it("returns true for non-excluded language when enabled", () => {
    const settings: LanguageBadgeSettings = { id: "default", enabled: true, excludedLanguages: ["en"] };
    expect(shouldShowLanguageBadge("fr", settings)).toBe(true);
  });

  it("returns false for excluded language", () => {
    const settings: LanguageBadgeSettings = { id: "default", enabled: true, excludedLanguages: ["en", "fr"] };
    expect(shouldShowLanguageBadge("fr", settings)).toBe(false);
  });

  it("returns true when enabled with empty exclusion list", () => {
    const settings: LanguageBadgeSettings = { id: "default", enabled: true, excludedLanguages: [] };
    expect(shouldShowLanguageBadge("en", settings)).toBe(true);
  });
});

describe("LANGUAGE_NAMES", () => {
  it("maps common codes to display names", () => {
    expect(LANGUAGE_NAMES["en"]).toBe("English");
    expect(LANGUAGE_NAMES["fr"]).toBe("French");
    expect(LANGUAGE_NAMES["de"]).toBe("German");
    expect(LANGUAGE_NAMES["ja"]).toBe("Japanese");
  });
});
