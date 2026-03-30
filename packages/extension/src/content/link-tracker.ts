import { isWikipediaUrl } from "@wikipedia-breadcrumbs/shared";

interface ClickData {
  href: string;
  textContent: string;
}

export class LinkTracker {
  private lastClick: ClickData | null = null;
  private referrer: string | null = null;

  handleClick(link: ClickData): void {
    if (isWikipediaUrl(link.href)) {
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
