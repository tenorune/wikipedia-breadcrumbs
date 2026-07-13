/**
 * Silent PWA auto-update (adapted from tenorune/on docs/pwa-auto-update.md):
 * - hadController guard: no reload on a visitor's very first install
 * - reloading guard: at most one reload per update, never a loop
 * - registration.update() on start and on every foreground — required for
 *   iOS standalone, which never re-checks the SW on resume by itself
 */
export function initServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return;
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading || !hadController) return;
    reloading = true;
    window.location.reload();
  });

  navigator.serviceWorker
    .register("/service-worker.js")
    .then((reg) => {
      const check = () => reg.update().catch(() => {});
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") check();
      });
      check();
    })
    .catch((err) => console.error("[pwa] SW registration failed:", err));
}
