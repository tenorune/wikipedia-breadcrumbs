import type { OffscreenRequest, OffscreenResponse, OffscreenEnvelope } from "../shared/messaging.js";

const OFFSCREEN_URL = "src/offscreen/index.html";
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 500;

async function ensureOffscreenDocument(): Promise<void> {
  const exists = await chrome.offscreen.hasDocument();
  if (exists) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: [chrome.offscreen.Reason.WORKERS],
    justification: "IndexedDB access for Wikipedia Breadcrumbs",
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendToOffscreen<T = unknown>(message: OffscreenRequest): Promise<OffscreenResponse<T>> {
  const envelope: OffscreenEnvelope = { target: "offscreen", request: message };
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      await ensureOffscreenDocument();
      return await chrome.runtime.sendMessage(envelope);
    } catch (err) {
      if (attempt < MAX_RETRIES - 1) {
        await sleep(RETRY_DELAY_MS * (attempt + 1));
      } else {
        console.error("Failed to communicate with offscreen document:", err);
        return { success: false, error: String(err) };
      }
    }
  }
  return { success: false, error: "Max retries exceeded" };
}
