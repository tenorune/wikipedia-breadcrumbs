let _deferredPrompt: any = null;
let _promptFired = $state(false);
let _installed = $state(false);
let _dismissed = $state(false);
let _showPromptOverride = $state(false);
let _hasViewedTrail = $state(false);
let _isIOS = false;
let _isAndroid = false;
let _isStandalone = false;
let _iosBrowser: "safari" | "chrome" | "other" = "safari";

export function initInstallStore() {
  if (typeof window === "undefined") return;

  _dismissed = localStorage.getItem("installPromptState") === "dismissed";
  _hasViewedTrail = localStorage.getItem("hasViewedTrail") === "true";

  const ua = navigator.userAgent;

  // iOS 17+ supports PWA install from Safari, Chrome, and Edge via Share → Add to Home Screen
  _isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
  _isAndroid = /Android/.test(ua);

  if (_isIOS) {
    if (/CriOS/.test(ua)) _iosBrowser = "chrome";
    else if (/FxiOS|EdgiOS/.test(ua)) _iosBrowser = "other";
    else _iosBrowser = "safari";
  }

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
    return _promptFired || _isIOS || _isAndroid;
  },
  get platform(): "android" | "ios" | null {
    if (_promptFired) return "android";
    if (_isIOS) return "ios";
    if (_isAndroid) return "android";
    return null;
  },
  get hasNativeInstall(): boolean {
    return _promptFired;
  },
  get iosBrowser(): "safari" | "chrome" | "other" {
    return _iosBrowser;
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
  get storageShared(): boolean {
    return !_isIOS;
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
