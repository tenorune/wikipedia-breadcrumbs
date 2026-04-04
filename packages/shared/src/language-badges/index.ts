import type { BreadcrumbsDB, LanguageBadgeSettings } from "../db/schema.js";

const DEFAULT_SETTINGS: LanguageBadgeSettings = {
  id: "default",
  enabled: true,
  excludedLanguages: [],
};

export async function getLanguageBadgeSettings(db: BreadcrumbsDB): Promise<LanguageBadgeSettings> {
  const settings = await db.languageSettings.get("default");
  if (settings?.configured) return settings;
  // Not yet configured — auto-exclude the user's first language
  const firstVisit = await db.visits
    .filter((v) => v.deletedAt === null)
    .sortBy("timestamp")
    .then((visits) => visits[0] ?? null);
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    excludedLanguages: firstVisit ? [firstVisit.language] : [],
  };
}

export async function saveLanguageBadgeSettings(db: BreadcrumbsDB, settings: LanguageBadgeSettings): Promise<void> {
  await db.languageSettings.put(settings);
}

export async function getDistinctLanguages(db: BreadcrumbsDB): Promise<{ languages: string[]; firstLanguage: string | null }> {
  const visits = await db.visits
    .filter((v) => v.deletedAt === null)
    .toArray();
  visits.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const v of visits) {
    if (!seen.has(v.language)) {
      seen.add(v.language);
      ordered.push(v.language);
    }
  }
  return { languages: ordered, firstLanguage: ordered[0] ?? null };
}

export function shouldShowLanguageBadge(language: string, settings: LanguageBadgeSettings): boolean {
  if (!settings.enabled) return false;
  return !settings.excludedLanguages.includes(language);
}

export function formatExcludedLabel(codes: string[]): string {
  const names = codes.map((c) => LANGUAGE_NAMES[c] ?? c.toUpperCase());
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return names.slice(0, -1).join(", ") + ", or " + names[names.length - 1];
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
