<script lang="ts">
  import type { Trail, Visit } from "@wikipedia-breadcrumbs/shared";
  import TrailView from "./TrailView.svelte";
  import Controls from "./Controls.svelte";

  let trail: Trail | null = $state(null);
  let visits: Visit[] = $state([]);
  let tabId = $state(0);
  let loading = $state(true);

  async function loadCurrentTrail() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) { loading = false; return; }
    tabId = tab.id;
    const response = await chrome.runtime.sendMessage({ type: "getCurrentTrail", tabId: tab.id });
    trail = response.trail;
    visits = response.visits ?? [];
    loading = false;
  }

  async function startNewTrail() {
    await chrome.runtime.sendMessage({ type: "startNewTrail", tabId });
    // Reload to show the new trail created from the current page
    await loadCurrentTrail();
  }

  async function endTrail() {
    if (!trail) return;
    await chrome.runtime.sendMessage({ type: "endTrail", trailId: trail.id });
    trail = null;
    visits = [];
  }

  async function renameTrail(name: string) {
    if (!trail) return;
    await chrome.runtime.sendMessage({ type: "renameTrail", trailId: trail.id, name });
    trail.name = name;
  }

  loadCurrentTrail();
</script>

<main>
  {#if loading}
    <div class="loading">Loading...</div>
  {:else}
    <TrailView {trail} {visits} onRename={renameTrail} />
    <Controls hasActiveTrail={trail !== null} trailId={trail?.id ?? null} {tabId} onStartNew={startNewTrail} onEndTrail={endTrail} />
  {/if}
</main>

<style>
  main { display: flex; flex-direction: column; min-height: 200px; }
  .loading { padding: 24px; text-align: center; color: #666; }
</style>
