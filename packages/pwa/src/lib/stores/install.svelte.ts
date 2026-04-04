let _deferredPrompt: any = null;
let _promptFired = $state(false);
let _installed = $state(false);
let _dismissed = $state(false);
let _showPromptOverride = $state(false);
let _hasViewedTrail = $state(false);
let _isIOS = false;
let _isStandalone = false;

export function initInstallStore() {
  if (typeof window === "undefined") return;

  _dismissed = localStorage.getItem("installPromptState") === "dismissed";
  _hasViewedTrail = localStorage.getItem("hasViewedTrail") === "true";

  _isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    && !(window as any).MSStream
    && /Safari/.test(navigator.userAgent)
    && !/CriOS|FxiOS/.test(navigator.userAgent);

  _isStandalone = window.matchMedia("(display-mode: standalone)").matches
    || (navigator as any).standalone === true;

  window.addEventListener("beforeinstallprompt", (e: Event) => {
    e.preventDefault();
    _deferredPrompt = e;
    _promptFired = true;
  });

  window.addEventListener("appinstalled", () => {
    _installed = true;
    _deferredPrompt = null;
  });
}

export function markTrailViewed() {
  _hasViewedTrail = true;
  localStorage.setItem("hasViewedTrail", "true");
}

export const installState = {
  get eligible(): boolean {
    if (_isStandalone || _installed) return false;
    if (!_hasViewedTrail) return false;
    return _promptFired || _isIOS;
  },
  get platform(): "android" | "ios" | null {
    if (_promptFired) return "android";
    if (_isIOS) return "ios";
    return null;
  },
  get dismissed(): boolean {
    return _dismissed;
  },
  get installed(): boolean {
    return _installed || _isStandalone;
  },
  get showPromptOverride(): boolean {
    return _showPromptOverride;
  },
};

export function dismissInstallPrompt() {
  _dismissed = true;
  _showPromptOverride = false;
  localStorage.setItem("installPromptState", "dismissed");
}

export function reopenInstallPrompt() {
  _showPromptOverride = true;
}

export async function triggerInstall() {
  if (_deferredPrompt) {
    await _deferredPrompt.prompt();
    const { outcome } = await _deferredPrompt.userChoice;
    if (outcome === "accepted") {
      _installed = true;
    }
    _deferredPrompt = null;
  }
}
