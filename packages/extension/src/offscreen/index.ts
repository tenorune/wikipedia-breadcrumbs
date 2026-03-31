import { BreadcrumbsDB } from "@wikipedia-breadcrumbs/shared";
import { handleOffscreenMessage } from "./handler.js";
import { handleSyncMessage } from "./sync-handler.js";
import type { OffscreenEnvelope } from "../shared/messaging.js";

const db = new BreadcrumbsDB();

const SYNC_TYPES = new Set(["enableSync", "disableSync", "syncNow", "getSyncStatus"]);

chrome.runtime.onMessage.addListener(
  (message: any, _sender, sendResponse) => {
    if (message.target !== "offscreen") return false;
    const req = message.request;
    if (SYNC_TYPES.has(req.type)) {
      handleSyncMessage(db, req.type).then(sendResponse);
    } else {
      handleOffscreenMessage(db, req).then(sendResponse);
    }
    return true;
  }
);
