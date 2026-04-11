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
/**
 * Active auth flow state. The content script on the redirect page sends
 * an `authCallback` message with the full URL (including hash fragment).
 * This is more reliable than chrome.tabs.get() which may not return URLs
 * or hash fragments on Safari.
 */
let pendingAuthResolve: ((url: string) => void) | null = null;
let pendingAuthTabId: number | undefined;
let originTabId: number | undefined;

/** Called by the background message handler when the content script sends authCallback. */
export function handleAuthCallback(url: string, senderTabId?: number) {
  if (pendingAuthResolve && (senderTabId === undefined || senderTabId === pendingAuthTabId)) {
    const resolve = pendingAuthResolve;
    pendingAuthResolve = null;
    chrome.tabs.remove(pendingAuthTabId!).catch(() => {});
    resolve(url);
  }
}

export function launchTabAuthFlow(authUrl: string, targetUrlPrefix: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Sign-in timed out"));
    }, AUTH_TIMEOUT_MS);

    function cleanup() {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      pendingAuthResolve = null;
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onRemoved.removeListener(onRemoved);
    }

    function found(url: string) {
      cleanup();
      chrome.tabs.remove(pendingAuthTabId!).catch(() => {});
      // Focus the tab that initiated the auth flow
      if (originTabId != null) {
        chrome.tabs.update(originTabId, { active: true }).catch(() => {});
      }
      resolve(url);
    }

    // Primary detection: content script sends authCallback message
    pendingAuthResolve = found;

    // Fallback detection: tab URL change (works on Chrome)
    function onUpdated(updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo) {
      if (updatedTabId !== pendingAuthTabId) return;
      if (changeInfo.url?.startsWith(targetUrlPrefix)) {
        found(changeInfo.url);
      }
    }

    function onRemoved(removedTabId: number) {
      if (removedTabId !== pendingAuthTabId) return;
      cleanup();
      reject(new Error("Sign-in tab was closed"));
    }

    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onRemoved.addListener(onRemoved);

    // Remember the current tab so we can focus it after auth completes
    chrome.tabs.query({ active: true, currentWindow: true }).then(([active]) => {
      originTabId = active?.id;
    }).catch(() => {});

    chrome.tabs.create({ url: authUrl }).then((tab) => {
      if (tab.id != null) {
        pendingAuthTabId = tab.id;
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
