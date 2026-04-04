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
    expect(settings.enabled).toBe(false);
    expect(settings.excludedLanguages).toEqual([]);
  });

  it("returns saved settings", async () => {
    await db.languageSettings.put({ id: "default", enabled: true, excludedLanguages: ["en"] });
    const settings = await getLanguageBadgeSettings(db);
    expect(settings.enabled).toBe(true);
    expect(settings.excludedLanguages).toEqual(["en"]);
  });
});

describe("saveLanguageBadgeSettings", () => {
  it("saves and retrieves settings", async () => {
    await saveLanguageBadgeSettings(db, { id: "default", enabled: true, excludedLanguages: ["en", "es"] });
    const settings = await getLanguageBadgeSettings(db);
    expect(settings.enabled).toBe(true);
    expect(settings.excludedLanguages).toEqual(["en", "es"]);
  });

  it("overwrites previous settings", async () => {
    await saveLanguageBadgeSettings(db, { id: "default", enabled: true, excludedLanguages: ["en"] });
    await saveLanguageBadgeSettings(db, { id: "default", enabled: false, excludedLanguages: [] });
    const settings = await getLanguageBadgeSettings(db);
    expect(settings.enabled).toBe(false);
    expect(settings.excludedLanguages).toEqual([]);
  });
});

describe("getDistinctLanguages", () => {
  it("returns empty array when no visits", async () => {
    const langs = await getDistinctLanguages(db);
    expect(langs).toEqual([]);
  });

  it("returns unique languages from visits", async () => {
    const base = { trailId: "t1", position: 1, sourceType: SourceType.Link, articleId: "a" };
    await db.visits.add(createVisit({ ...base, url: "https://en.wikipedia.org/wiki/A", title: "A", language: "en" }));
    await db.visits.add(createVisit({ ...base, url: "https://fr.wikipedia.org/wiki/B", title: "B", language: "fr", position: 2 }));
    await db.visits.add(createVisit({ ...base, url: "https://en.wikipedia.org/wiki/C", title: "C", language: "en", position: 3 }));
    const langs = await getDistinctLanguages(db);
    expect(langs.sort()).toEqual(["en", "fr"]);
  });

  it("excludes soft-deleted visits", async () => {
    const base = { trailId: "t1", position: 1, sourceType: SourceType.Link, articleId: "a" };
    const visit = createVisit({ ...base, url: "https://de.wikipedia.org/wiki/A", title: "A", language: "de" });
    await db.visits.add(visit);
    await db.visits.update(visit.id, { deletedAt: new Date().toISOString() });
    const langs = await getDistinctLanguages(db);
    expect(langs).toEqual([]);
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
