<script lang="ts">
  import type { Trail, Visit } from "@wikipedia-breadcrumbs/shared";
  import TrailView from "./TrailView.svelte";
  import Controls from "./Controls.svelte";

  let trail: Trail | null = $state(null);
  let visits: Visit[] = $state([]);
  let tabId = $state(0);
  let currentUrl = $state("");
  let loading = $state(true);

  async function loadCurrentTrail() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) { loading = false; return; }
      tabId = tab.id;
      const response = await chrome.runtime.sendMessage({ type: "getCurrentTrail", tabId: tab.id });
      trail = response.trail;
      visits = response.visits ?? [];
      currentUrl = response.currentUrl ?? tab.url ?? "";
    } catch {
      // Safari may deny tab access on non-permitted sites — show empty state
    }
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
    <div class="delayed-spinner"></div>
  {:else}
    <div class="content">
      <TrailView {trail} {visits} {currentUrl} {tabId} onRename={renameTrail} />
    </div>
    <Controls hasActiveTrail={trail !== null} trailId={trail?.id ?? null} {tabId} onStartNew={startNewTrail} onEndTrail={endTrail} />
  {/if}
</main>

<style>
  :global(*:focus-visible) { outline: 2px solid #0066cc; outline-offset: 2px; }
  main { display: flex; flex-direction: column; height: 435px; }
  .content { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-height: 0; }
  .delayed-spinner {
    opacity: 0; animation: fadeInSpinner 0.3s ease-in 2s forwards;
    display: flex; justify-content: center; padding: 24px 0;
  }
  .delayed-spinner::after {
    content: ""; width: 20px; height: 20px;
    border: 2px solid #e0e0e0; border-top-color: #999;
    border-radius: 50%; animation: spin 0.8s linear infinite;
  }
  @keyframes fadeInSpinner { to { opacity: 1; } }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
