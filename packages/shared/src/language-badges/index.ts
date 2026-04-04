import type { BreadcrumbsDB, LanguageBadgeSettings } from "../db/schema.js";

const DEFAULT_SETTINGS: LanguageBadgeSettings = {
  id: "default",
  enabled: false,
  excludedLanguages: [],
};

export async function getLanguageBadgeSettings(db: BreadcrumbsDB): Promise<LanguageBadgeSettings> {
  const settings = await db.languageSettings.get("default");
  return settings ?? { ...DEFAULT_SETTINGS };
}

export async function saveLanguageBadgeSettings(db: BreadcrumbsDB, settings: LanguageBadgeSettings): Promise<void> {
  await db.languageSettings.put(settings);
}

export async function getDistinctLanguages(db: BreadcrumbsDB): Promise<string[]> {
  const visits = await db.visits
    .filter((v) => v.deletedAt === null)
    .toArray();
  const langs = new Set(visits.map((v) => v.language));
  return [...langs].sort();
}

export function shouldShowLanguageBadge(language: string, settings: LanguageBadgeSettings): boolean {
  if (!settings.enabled) return false;
  return !settings.excludedLanguages.includes(language);
}

export const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  fr: "French",
  de: "German",
  es: "Spanish",
  it: "Italian",
  pt: "Portuguese",
  ru: "Russian",
  ja: "Japanese",
  zh: "Chinese",
  ko: "Korean",
  ar: "Arabic",
  nl: "Dutch",
  sv: "Swedish",
  pl: "Polish",
  uk: "Ukrainian",
  he: "Hebrew",
  vi: "Vietnamese",
  fi: "Finnish",
  cs: "Czech",
  no: "Norwegian",
  da: "Danish",
  hu: "Hungarian",
  ro: "Romanian",
  tr: "Turkish",
  th: "Thai",
  id: "Indonesian",
  ca: "Catalan",
  el: "Greek",
  hi: "Hindi",
  fa: "Persian",
  bn: "Bengali",
  ms: "Malay",
  ta: "Tamil",
  sr: "Serbian",
  hr: "Croatian",
  bg: "Bulgarian",
  sk: "Slovak",
  sl: "Slovenian",
  lt: "Lithuanian",
  lv: "Latvian",
  et: "Estonian",
};
