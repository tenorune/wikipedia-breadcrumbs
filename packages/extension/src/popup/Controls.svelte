<script lang="ts">
  interface Props {
    hasActiveTrail: boolean;
    trailId: string | null;
    tabId: number;
    onStartNew: () => void;
    onEndTrail: () => void;
  }

  let { hasActiveTrail, trailId, tabId, onStartNew, onEndTrail }: Props = $props();

  async function openExtensionPage(url: string) {
    // Find any existing extension tab — query all tabs since URL-filtered
    // queries require the tabs permission which we've removed
    const allTabs = await chrome.tabs.query({});
    const extOrigin = chrome.runtime.getURL("");
    const existing = allTabs.find((t) => t.url?.startsWith(extOrigin));
    if (existing?.id != null) {
      chrome.tabs.update(existing.id, { active: true, url });
      if (typeof chrome.windows !== "undefined") {
        chrome.windows.update(existing.windowId!, { focused: true });
      }
    } else {
      chrome.tabs.create({ url });
    }
  }

  function openHistory() {
    openExtensionPage(chrome.runtime.getURL("src/history/index.html"));
  }

  function openOptions() {
    openExtensionPage(chrome.runtime.getURL("src/options/index.html"));
  }
</script>

<div class="controls">
  <div class="trail-action">
    {#if hasActiveTrail}
      <button class="action-btn end" onclick={onEndTrail}>End Trail</button>
    {:else}
      <button class="action-btn start" onclick={onStartNew}>Start New Trail</button>
    {/if}
  </div>

  <nav class="tab-bar">
    <button class="tab" onclick={openHistory}>
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/></svg>
      <span>Trails</span>
    </button>
    <button class="tab" onclick={openOptions}>
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 17H5"/><path d="M19 7h-9"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/></svg>
      <span>Settings</span>
    </button>
  </nav>
</div>

<style>
  .controls { border-top: 1px solid #e0e0e0; margin-top: auto; }

  .trail-action { padding: 8px 12px; }
  .action-btn {
    width: 100%;
    padding: 8px;
    border: 1px solid #ddd;
    border-radius: 6px;
    background: white;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
  }
  .action-btn:hover { background: #f5f5f5; }
  .action-btn.start { color: #0066cc; border-color: #aac4f5; }
  .action-btn.end { color: #cc3300; border-color: #f5c0b0; }

  .tab-bar {
    display: flex;
    justify-content: space-around;
    border-top: 1px solid #f0f0f0;
    padding: 6px 0;
  }
  .tab {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    background: none;
    border: none;
    cursor: pointer;
    color: #999;
    padding: 4px 12px;
    font-size: 11px;
  }
  .tab:hover { color: #0066cc; }
  .tab svg { width: 20px; height: 20px; }
</style>
