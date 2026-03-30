<script lang="ts">
  interface Props {
    hasActiveTrail: boolean;
    trailId: string | null;
    tabId: number;
    onStartNew: () => void;
    onEndTrail: () => void;
  }

  let { hasActiveTrail, trailId, tabId, onStartNew, onEndTrail }: Props = $props();

  async function openHistory() {
    const historyUrl = chrome.runtime.getURL("src/history/index.html");
    const tabs = await chrome.tabs.query({ url: historyUrl + "*" });
    if (tabs.length > 0 && tabs[0].id != null) {
      chrome.tabs.update(tabs[0].id, { active: true });
      chrome.windows.update(tabs[0].windowId!, { focused: true });
    } else {
      chrome.tabs.create({ url: historyUrl });
    }
  }

  function openOptions() {
    chrome.runtime.openOptionsPage();
  }
</script>

<div class="controls">
  {#if hasActiveTrail}
    <button onclick={onEndTrail}>End Trail</button>
  {:else}
    <button onclick={onStartNew}>Start New Trail</button>
  {/if}
  <button onclick={openHistory}>History</button>
  <button onclick={openOptions}>Options</button>
</div>

<style>
  .controls { display: flex; gap: 8px; padding: 8px 12px; border-top: 1px solid #e0e0e0; }
  button { flex: 1; padding: 6px 12px; border: 1px solid #ccc; border-radius: 4px; background: white; cursor: pointer; font-size: 13px; }
  button:hover { background: #f0f0f0; }
</style>
