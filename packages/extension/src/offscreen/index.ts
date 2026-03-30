import { BreadcrumbsDB } from "@wikipedia-breadcrumbs/shared";
import { handleOffscreenMessage } from "./handler.js";
import type { OffscreenEnvelope } from "../shared/messaging.js";

const db = new BreadcrumbsDB();

chrome.runtime.onMessage.addListener(
  (message: OffscreenEnvelope, _sender, sendResponse) => {
    if (message.target !== "offscreen") return false;
    handleOffscreenMessage(db, message.request).then(sendResponse);
    return true;
  }
);
