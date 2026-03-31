const NON_ARTICLE_PREFIXES = [
  "Special:", "Wikipedia:", "Help:", "Talk:", "User:", "User_talk:",
  "Category:", "File:", "Template:", "Portal:", "Draft:", "Module:", "MediaWiki:",
];

export interface ParsedWikipediaUrl {
  language: string;
  title: string;
  cleanUrl: string;
}

function extractParts(url: string): { language: string; rawTitle: string } | null {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    const pathname = urlObj.pathname;
    const hostMatch = hostname.match(/^([a-z]{2,})\.(?:m\.)?wikipedia\.org$/);
    if (!hostMatch) return null;
    const wikiPrefix = "/wiki/";
    if (!pathname.startsWith(wikiPrefix)) return null;
    const rawTitle = pathname.slice(wikiPrefix.length);
    if (!rawTitle) return null;
    return { language: hostMatch[1], rawTitle };
  } catch {
    return null;
  }
}

function isArticlePage(rawTitle: string): boolean {
  return !NON_ARTICLE_PREFIXES.some((prefix) => rawTitle.startsWith(prefix));
}

export function isWikipediaUrl(url: string): boolean {
  const parts = extractParts(url);
  if (!parts) return false;
  return isArticlePage(parts.rawTitle);
}

export function cleanWikipediaUrl(url: string): string {
  const parts = extractParts(url);
  if (!parts) return url;
  return `https://${parts.language}.wikipedia.org/wiki/${parts.rawTitle}`;
}

export function parseWikipediaUrl(url: string): ParsedWikipediaUrl | null {
  const parts = extractParts(url);
  if (!parts) return null;
  if (!isArticlePage(parts.rawTitle)) return null;
  const title = decodeURIComponent(parts.rawTitle).replaceAll("_", " ");
  const cleanUrl = `https://${parts.language}.wikipedia.org/wiki/${parts.rawTitle}`;
  return { language: parts.language, title, cleanUrl };
}
