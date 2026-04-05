<script lang="ts">
  import TabBar from "$lib/components/TabBar.svelte";
  import { initSync } from "$lib/stores/sync.svelte";
  import { initAuth, authState } from "$lib/stores/auth.svelte";
  import { upgradeToAuthenticatedUser } from "$lib/stores/sync.svelte";
  import { initInstallStore } from "$lib/stores/install.svelte";
  import { onMount } from "svelte";

  let { children } = $props();

  onMount(async () => {
    initInstallStore();

    // Set status bar color based on current route (only when installed as PWA)
    if (window.matchMedia("(display-mode: standalone)").matches) {
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) {
        const routeColors: Record<string, string> = {
          "/": "#f0f7ff",
          "/trails": "#f5a623",
          "/settings": "#f8f9fa",
        };
        const updateThemeColor = () => {
          const path = window.location.pathname;
          // Trail detail (/trails/[id]) uses the star color too
          const color = path.startsWith("/trails/") ? "#f5a623" : (routeColors[path] ?? "#0066cc");
          meta.setAttribute("content", color);
        };
        updateThemeColor();
        // SvelteKit client-side navigation doesn't trigger popstate reliably,
        // so poll on a short interval
        setInterval(updateThemeColor, 500);
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
