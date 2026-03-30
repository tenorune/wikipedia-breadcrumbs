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

chrome.runtime.onMessage.addListener((message: ContentMessage, _sender, sendResponse) => {
  if (message.type === "getClickContext") {
    sendResponse(tracker.consumeClickContext());
  } else if (message.type === "ping") {
    sendResponse({ pong: true });
  }
  return false;
});
