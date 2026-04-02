import { LinkTracker } from "./link-tracker.js";
import type { ContentMessage } from "../shared/messaging.js";

const tracker = new LinkTracker();
tracker.setReferrer(document.referrer);

document.body.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  const anchor = target.closest("a[href]") as HTMLAnchorElement | null;
  if (anchor?.href) {
    tracker.handleClick({ href: anchor.href, textContent: anchor.textContent?.trim() ?? "" });
  }
});

function getPageInfo(): { pageTitle: string; redirectedFrom: string | null } {
  // Get the actual page title from the heading
  const heading = document.getElementById("firstHeading");
  const pageTitle = heading?.textContent?.trim() ?? document.title.replace(/ - Wikipedia$/, "");

  // Check for redirect notice: "(Redirected from X)"
  let redirectedFrom: string | null = null;
  const redirectMsg = document.querySelector(".mw-redirectedfrom");
  if (redirectMsg) {
    const link = redirectMsg.querySelector("a");
    if (link) {
      redirectedFrom = link.textContent?.trim() ?? null;
    }
  }

  return { pageTitle, redirectedFrom };
}

chrome.runtime.onMessage.addListener((message: ContentMessage, _sender, sendResponse) => {
  if (message.type === "getClickContext") {
    sendResponse(tracker.consumeClickContext());
  } else if (message.type === "getPageInfo") {
    sendResponse(getPageInfo());
  } else if (message.type === "ping") {
    sendResponse({ pong: true });
  }
  return false;
});
