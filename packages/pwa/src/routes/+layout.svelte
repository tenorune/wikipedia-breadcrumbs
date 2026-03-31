<script lang="ts">
  import TabBar from "$lib/components/TabBar.svelte";
  import { initSync } from "$lib/stores/sync.svelte";
  import { initAuth, authState } from "$lib/stores/auth.svelte";
  import { upgradeToAuthenticatedUser } from "$lib/stores/sync.svelte";
  import { onMount } from "svelte";

  let { children } = $props();

  onMount(async () => {
    await initAuth();
    if (authState.isAuthenticated && authState.user && localStorage.getItem("pendingAuthUpgrade")) {
      await upgradeToAuthenticatedUser(authState.user.id);
      localStorage.removeItem("pendingAuthUpgrade");
    }
    await initSync();
  });
</script>

<div class="app">
  <div class="content">
    {@render children()}
  </div>
  <TabBar />
</div>

<style>
  :global(body) {
    margin: 0;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 14px;
    color: #1a1a1a;
    background: #fff;
  }
  .app {
    max-width: 900px;
    margin: 0 auto;
  }
  .content {
    padding: 16px 16px 80px;
  }
</style>
