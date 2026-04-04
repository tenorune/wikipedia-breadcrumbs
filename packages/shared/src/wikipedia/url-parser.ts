// English namespace prefixes
const NON_ARTICLE_PREFIXES = [
  "Special:", "Wikipedia:", "Help:", "Talk:", "User:", "User_talk:",
  "Category:", "File:", "Template:", "Portal:", "Draft:", "Module:", "MediaWiki:",
];

// Localized talk/meta namespace prefixes across major languages
const LOCALIZED_NON_ARTICLE_PREFIXES = [
  // Talk namespaces (various languages)
  "Diskussion:", "Discussion:", "Discussione:", "Discusión:",
  "Discussão:", "Обсуждение:", "Overleg:", "Dyskusja:",
  "Keskustelu:", "Tartışma:", "トーク:", "讨论:", "토론:",
  // User namespaces
  "Benutzer:", "Utilisateur:", "Utente:", "Usuario:",
  "Usuário:", "Участник:", "Gebruiker:", "Użytkownik:",
  "利用者:", "用户:", "사용자:",
  // Wikipedia/Project namespaces
  "Wikipédia:", "Vikipedi:",
  // Category namespaces
  "Kategorie:", "Catégorie:", "Categoria:", "Categoría:",
  "Категория:", "Categorie:", "Kategoria:", "Kategori:",
  // Help namespaces
  "Hilfe:", "Aide:", "Aiuto:", "Ayuda:", "Ajuda:", "Справка:",
  // Template namespaces
  "Vorlage:", "Modèle:", "Modello:", "Plantilla:", "Predefinição:", "Шаблон:",
  // Special namespaces
  "Spezial:", "Spécial:", "Speciale:", "Especial:", "Служебная:",
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
  const decoded = decodeURIComponent(rawTitle);
  if (NON_ARTICLE_PREFIXES.some((prefix) => decoded.startsWith(prefix))) return false;
  if (LOCALIZED_NON_ARTICLE_PREFIXES.some((prefix) => decoded.startsWith(prefix))) return false;
  // Catch any remaining talk pages: "*_talk:" or "*_Talk:" pattern
  if (/^[A-Za-z\u00C0-\u024F_]+_[Tt]alk:/i.test(decoded)) return false;
  return true;
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
