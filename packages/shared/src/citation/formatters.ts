import { CitationFormat } from "../models/enums.js";

interface CitationInput {
  url: string;
  title: string;
  timestamp: string;
  language: string;
  articleId: string;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const MLA_MONTHS = [
  "Jan.", "Feb.", "Mar.", "Apr.", "May", "June",
  "July", "Aug.", "Sept.", "Oct.", "Nov.", "Dec.",
];

function parseDate(timestamp: string) {
  const d = new Date(timestamp);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate() };
}

function formatISO(timestamp: string): string {
  const { year, month, day } = parseDate(timestamp);
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function urlWithoutProtocol(url: string): string {
  return url.replace(/^https?:\/\//, "");
}

export function formatCitation(input: CitationInput, format: CitationFormat): string {
  const { url, title, timestamp, language, articleId } = input;
  const { year, month, day } = parseDate(timestamp);

  switch (format) {
    case CitationFormat.Wikipedia:
      return `{{cite web |url=${url} |title=${title} |website=Wikipedia |language=${language} |access-date=${formatISO(timestamp)}}}`;
    case CitationFormat.APA:
      return `${title}. (${year}, ${MONTHS[month]} ${day}). In *Wikipedia*. ${url}`;
    case CitationFormat.MLA:
      return `"${title}." *Wikipedia*, Wikimedia Foundation, ${day} ${MLA_MONTHS[month]} ${year}, ${urlWithoutProtocol(url)}.`;
    case CitationFormat.Chicago:
      return `"${title}," Wikipedia, accessed ${MONTHS[month]} ${day}, ${year}, ${url}.`;
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
