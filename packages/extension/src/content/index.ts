import { LinkTracker } from "./link-tracker.js";
import type { ContentMessage } from "../shared/messaging.js";

// Detect OAuth callback: auth flow redirects to Special:BlankPage with tokens in hash
if (window.location.hash.includes("access_token")) {
  chrome.runtime.sendMessage({ type: "authCallback", url: window.location.href });
  throw new Error("breadcrumbs:auth-callback");
}

const tracker = new LinkTracker();
tracker.setReferrer(document.referrer);

// Track whether the user clicked a link before this page loaded
let lastClickedText: string | null = null;

document.body.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  const anchor = target.closest("a[href]") as HTMLAnchorElement | null;
  if (anchor?.href) {
    tracker.handleClick({ href: anchor.href, textContent: anchor.textContent?.trim() ?? "" });
    lastClickedText = anchor.textContent?.trim() ?? "";
    // Send clicked link text to background immediately so it's available after navigation
    try {
      chrome.runtime.sendMessage({ type: "linkClicked", text: lastClickedText });
    } catch {}
  }
});

function getPageInfo(): { pageTitle: string; redirectedFrom: string | null } {
  const heading = document.getElementById("firstHeading");
  const pageTitle = heading?.textContent?.trim() ?? document.title.replace(/ - Wikipedia$/, "");

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

// Announce this page visit to the background — replaces webNavigation.onCommitted
function announcePageVisit() {
  const { pageTitle, redirectedFrom } = getPageInfo();
  try {
    chrome.runtime.sendMessage({
      type: "pageVisited",
      url: window.location.href,
      title: pageTitle,
      redirectedFrom,
    });
  } catch {}
}

announcePageVisit();

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
