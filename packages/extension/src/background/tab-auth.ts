/**
 * Tab-based OAuth flow for browsers without chrome.identity (Safari).
 *
 * Opens a tab to the auth URL and watches for it to redirect to the
 * target URL with tokens in the hash or query params. Extracts tokens,
 * closes the tab, and returns the callback URL.
 */

const AUTH_TIMEOUT_MS = 120000; // 2 minutes

/**
 * Open a tab to `authUrl` and wait for it to navigate to a URL starting
 * with `targetUrlPrefix`. Returns the full callback URL with tokens.
 */
export function launchTabAuthFlow(authUrl: string, targetUrlPrefix: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let tabId: number | undefined;
    let settled = false;

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Sign-in timed out"));
    }, AUTH_TIMEOUT_MS);

    function cleanup() {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onRemoved.removeListener(onRemoved);
    }

    function onUpdated(updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo) {
      if (updatedTabId !== tabId || !changeInfo.url) return;
      if (changeInfo.url.startsWith(targetUrlPrefix)) {
        const url = changeInfo.url;
        cleanup();
        // Close the tab (don't await — we have the URL)
        chrome.tabs.remove(updatedTabId).catch(() => {});
        resolve(url);
      }
    }

    function onRemoved(removedTabId: number) {
      if (removedTabId !== tabId) return;
      cleanup();
      reject(new Error("Sign-in tab was closed"));
    }

    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onRemoved.addListener(onRemoved);

    chrome.tabs.create({ url: authUrl }).then((tab) => {
      if (tab.id != null) {
        tabId = tab.id;
      } else {
        cleanup();
        reject(new Error("Failed to create auth tab"));
      }
    });
  });
}

/** Check if chrome.identity is available (Chrome) or not (Safari). */
export const hasIdentityApi = typeof chrome.identity !== "undefined"
  && typeof chrome.identity.launchWebAuthFlow === "function";
