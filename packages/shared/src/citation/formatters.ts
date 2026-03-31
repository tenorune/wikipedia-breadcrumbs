import { CitationFormat } from "../models/enums.js";

interface CitationInput {
  url: string;
  title: string;
  timestamp: string;
  language: string;
  articleId: string;
}

function parseDate(timestamp: string) {
  const d = new Date(timestamp);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate() };
}

function formatISO(timestamp: string): string {
  const { year, month, day } = parseDate(timestamp);
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function formatLocalDate(timestamp: string, locale?: string, style: "long" | "short" = "long"): string {
  const d = new Date(timestamp);
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: style,
    day: "numeric",
    timeZone: "UTC",
  }).format(d);
}

function formatLocalDateShort(timestamp: string, locale?: string): string {
  return formatLocalDate(timestamp, locale, "short");
}

function urlWithoutProtocol(url: string): string {
  return url.replace(/^https?:\/\//, "");
}

export function formatCitation(input: CitationInput, format: CitationFormat, locale?: string): string {
  const { url, title, timestamp, language, articleId } = input;
  const { year } = parseDate(timestamp);

  // Use the article's language as locale hint if no locale provided
  const loc = locale ?? language;

  switch (format) {
    case CitationFormat.Wikipedia:
      return `{{cite web |url=${url} |title=${title} |website=Wikipedia |language=${language} |access-date=${formatISO(timestamp)}}}`;

    case CitationFormat.APA:
      // APA: Title. (Year, localized date). In *Wikipedia*. URL
      return `${title}. (${year}, ${formatLocalDate(timestamp, loc)}). In *Wikipedia*. ${url}`;

    case CitationFormat.MLA:
      // MLA: "Title." *Wikipedia*, Wikimedia Foundation, localized date, URL.
      return `"${title}." *Wikipedia*, Wikimedia Foundation, ${formatLocalDate(timestamp, loc)}, ${urlWithoutProtocol(url)}.`;

    case CitationFormat.Chicago:
      // Chicago: "Title," Wikipedia, accessed localized date, URL.
      return `"${title}," Wikipedia, accessed ${formatLocalDate(timestamp, loc)}, ${url}.`;

    case CitationFormat.BibTeX:
      return [
        `@misc{wiki:${articleId},`,
        `  title = {${title}},`,
        `  url = {${url}},`,
        `  journal = {Wikipedia},`,
        `  language = {${language}},`,
        `  year = {${year}},`,
        `  note = {Accessed ${formatISO(timestamp)}}`,
        `}`,
      ].join("\n");

    case CitationFormat.URL:
      return url;

    case CitationFormat.Markdown:
      return `[${title}](${url})`;

    default: {
      const _exhaustive: never = format;
      throw new Error(`Unknown format: ${_exhaustive}`);
    }
  }
}
