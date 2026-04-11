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

    function found(url: string) {
      cleanup();
      chrome.tabs.remove(tabId!).catch(() => {});
      resolve(url);
    }

    async function checkTabUrl(id: number) {
      try {
        const tab = await chrome.tabs.get(id);
        if (tab.url?.startsWith(targetUrlPrefix)) {
          found(tab.url);
        }
      } catch { /* tab may be gone */ }
    }

    function onUpdated(updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo) {
      if (updatedTabId !== tabId) return;
      // Chrome provides changeInfo.url; Safari may not — fall back to polling tab URL
      if (changeInfo.url?.startsWith(targetUrlPrefix)) {
        found(changeInfo.url);
      } else if (changeInfo.status === "loading" || changeInfo.status === "complete") {
        checkTabUrl(updatedTabId);
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
