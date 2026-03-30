// Inline Wikipedia URL check to avoid bundling Dexie into content script
function isWikipediaArticleUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (!u.hostname.match(/^[a-z]{2,}\.(?:m\.)?wikipedia\.org$/)) return false;
    if (!u.pathname.startsWith("/wiki/")) return false;
    const title = u.pathname.slice(6);
    if (!title) return false;
    const nonArticle = ["Special:", "Wikipedia:", "Help:", "Talk:", "User:", "User_talk:", "Category:", "File:", "Template:", "Portal:", "Draft:", "Module:", "MediaWiki:"];
    return !nonArticle.some((p) => title.startsWith(p));
  } catch { return false; }
}

interface ClickData {
  href: string;
  textContent: string;
}

export class LinkTracker {
  private lastClick: ClickData | null = null;
  private referrer: string | null = null;

  handleClick(link: ClickData): void {
    if (isWikipediaArticleUrl(link.href)) {
      this.lastClick = link;
    }
  }

  setReferrer(url: string): void {
    this.referrer = url;
  }

  consumeClickContext(): { clickedLinkText: string | null; referrerUrl: string | null } {
    const result = {
      clickedLinkText: this.lastClick?.textContent ?? null,
      referrerUrl: this.referrer,
    };
    this.lastClick = null;
    return result;
  }
}
