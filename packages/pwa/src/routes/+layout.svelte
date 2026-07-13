<script lang="ts">
  import TabBar from "$lib/components/TabBar.svelte";
  import { initSync, syncState } from "$lib/stores/sync.svelte";
  import { initAuth, authState } from "$lib/stores/auth.svelte";
  import { upgradeToAuthenticatedUser } from "$lib/stores/sync.svelte";
  import { initInstallStore } from "$lib/stores/install.svelte";
  import { onMount } from "svelte";
  import { dev } from "$app/environment";
  import { initServiceWorker } from "$lib/sw-registration";

  let { children } = $props();

  onMount(async () => {
    if (!dev) initServiceWorker();
    initInstallStore();

    // Dynamic status bar color (only when installed as PWA)
    if (window.matchMedia("(display-mode: standalone)").matches) {
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) {
        meta.setAttribute("content", "#99c5f4");
        const tints = [
          "#99c5f4", "#a3caf5", "#add0f6", "#b7d6f7", "#c1dcf8",
          "#cce2f9", "#d6e7fa", "#e0edfb", "#eaf3fc", "#f4f9fd", "#ffffff",
        ];
        // 20 steps (11 up + 9 back) over 3s = 150ms per step
        const stepMs = 150;
        let animating = false;
        (window as any).__runStatusBarCycle = () => {
          if (animating) return;
          animating = true;
          let idx = 0;
          let dir = 1;
          const iv = setInterval(() => {
            meta.setAttribute("content", tints[idx]);
            idx += dir;
            if (idx >= tints.length - 1) dir = -1;
            if (idx <= 0) {
              clearInterval(iv);
              animating = false;
              meta.setAttribute("content", "#99c5f4");
            }
          }, stepMs);
        };
      }
    }
    await initAuth();

    // If returning from Google OAuth redirect, wait a moment for Supabase
    // to process the URL hash and fire onAuthStateChange
    if (window.location.hash.includes("access_token") || localStorage.getItem("pendingAuthUpgrade")) {
      // Give Supabase time to process the callback
      await new Promise((r) => setTimeout(r, 1000));
    }

    if (authState.isAuthenticated && authState.user && localStorage.getItem("pendingAuthUpgrade")) {
      await upgradeToAuthenticatedUser(authState.user.id);
      localStorage.removeItem("pendingAuthUpgrade");
    }
    await initSync();
  });

  // Trigger status bar cycle on sync or sign-in
  let _prevSyncing = false;
  $effect(() => {
    if (syncState.syncing && !_prevSyncing) {
      (window as any).__runStatusBarCycle?.();
    }
    _prevSyncing = syncState.syncing;
  });
  let _prevAuth = false;
  $effect(() => {
    const signedIn = authState.isAuthenticated;
    if (signedIn && !_prevAuth) {
      (window as any).__runStatusBarCycle?.();
    }
    _prevAuth = signedIn;
  });
</script>

<div class="app">
  <main class="content">
    {@render children()}
  </main>
  <TabBar />
</div>

<style>
  :global(html, body) {
    margin: 0;
    height: 100%;
    overflow: hidden;
  }
  :global(*, *::before, *::after) {
    -webkit-tap-highlight-color: transparent;
  }
  :global(*:focus-visible) {
    outline: 2px solid #0066cc;
    outline-offset: 2px;
  }
  :global(.delayed-spinner) {
    opacity: 0;
    animation: fadeInSpinner 0.3s ease-in 2s forwards;
    display: flex;
    justify-content: center;
    padding: 24px 0;
  }
  :global(.delayed-spinner::after) {
    content: "";
    width: 20px;
    height: 20px;
    border: 2px solid #e0e0e0;
    border-top-color: #999;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes fadeInSpinner { to { opacity: 1; } }
  @keyframes spin { to { transform: rotate(360deg); } }
  :global(body) {
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 14px;
    color: #1a1a1a;
    background: #fff;
  }
  .app {
    max-width: 900px;
    margin: 0 auto;
    height: 100dvh;
    display: flex;
    flex-direction: column;
  }
  .content {
    flex: 1;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
    padding: 16px 16px 80px;
  }
</style>
