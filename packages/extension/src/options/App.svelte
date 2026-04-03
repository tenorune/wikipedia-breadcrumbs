<script lang="ts">
  import SettingsForm from "./SettingsForm.svelte";

  async function openHistory() {
    const historyUrl = chrome.runtime.getURL("src/history/index.html");
    const tabs = await chrome.tabs.query({ url: historyUrl + "*" });
    if (tabs.length > 0 && tabs[0].id != null) {
      chrome.tabs.update(tabs[0].id, { active: true });
      chrome.windows.update(tabs[0].windowId!, { focused: true });
    } else {
      // Open history in the current tab
      window.location.href = historyUrl;
    }
  }
</script>

<main>
  <div class="header-row">
    <h1>Wikipedia Breadcrumbs</h1>
    <span class="icon-spacer"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 17H5"/><path d="M19 7h-9"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/></svg></span>
  </div>
  <button class="back" onclick={openHistory}>&larr; View trails</button>
  <h2>Settings</h2>
  <SettingsForm />
</main>

<style>
  main { max-width: 700px; margin: 0 auto; }
  .header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
  h1 { margin: 0; font-size: 24px; }
  .icon-spacer { font-size: 20px; padding: 4px; visibility: hidden; }
  .back { background: none; border: none; color: #0066cc; cursor: pointer; padding: 0; margin-bottom: 16px; font-size: 14px; display: block; }
  .back:hover { text-decoration: underline; }
  h2 { margin: 0 0 20px; }
</style>
