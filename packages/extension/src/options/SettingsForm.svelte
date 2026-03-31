<script lang="ts">
  import { getSettings, updateSettings, type ExtensionSettings } from "../shared/settings.js";

  let settings: ExtensionSettings | null = $state(null);
  let saved = $state(false);
  let syncing = $state(false);
  let syncStatus: any = $state(null);

  async function loadSyncStatus() {
    // Read lastSyncTime directly from chrome.storage.local — no message chain needed
    const { lastSyncTime } = await chrome.storage.local.get("lastSyncTime");
    syncStatus = { lastSyncTime: lastSyncTime ?? null };
  }

  async function handleSyncNow() {
    syncing = true;
    const { lastSyncTime: beforeSync } = await chrome.storage.local.get("lastSyncTime");
    chrome.runtime.sendMessage({ type: "syncNow" }); // fire and forget
    // Poll chrome.storage.local directly until lastSyncTime changes
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const { lastSyncTime } = await chrome.storage.local.get("lastSyncTime");
      if (lastSyncTime && lastSyncTime !== beforeSync) {
        syncStatus = { lastSyncTime };
        break;
      }
    }
    syncing = false;
  }

  // Load sync status on mount
  loadSyncStatus();

  async function load() {
    settings = await getSettings();
  }

  async function save() {
    if (!settings) return;
    await updateSettings(settings);
    saved = true;
    setTimeout(() => saved = false, 2000);
  }

  load();
</script>

{#if settings}
  <form onsubmit={(e) => { e.preventDefault(); save(); }}>
    <div class="field">
      <label for="idle-timeout">Idle timeout (minutes)</label>
      <input id="idle-timeout" type="number" min="5" max="120" bind:value={settings.idleTimeoutMinutes} />
      <p class="help">A new trail starts after this many minutes of no Wikipedia navigation in a tab.</p>
    </div>
    <div class="field">
      <label>
        <input type="checkbox" bind:checked={settings.captureEnabled} />
        Capture enabled
      </label>
      <p class="help">When disabled, no new visits are recorded.</p>
    </div>
    <hr />

    <div class="field">
      <label>
        <input type="checkbox" bind:checked={settings.syncEnabled} />
        Sync to cloud
      </label>
      <p class="help">Sync trails to Supabase. Data is stored anonymously.</p>
    </div>

    {#if settings.syncEnabled}
      <div class="field">
        <button type="button" class="sync-btn" onclick={handleSyncNow} disabled={syncing}>
          {syncing ? "Syncing..." : "Sync now"}
        </button>
        {#if syncStatus}
          <p class="help">
            Last synced: {syncStatus.lastSyncTime
              ? new Date(syncStatus.lastSyncTime).toLocaleString(undefined, { year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })
              : "Never"}
          </p>
        {/if}
      </div>
    {/if}

    <button type="submit">Save</button>
    {#if saved}<span class="saved">Saved!</span>{/if}
  </form>
{:else}
  <p>Loading...</p>
{/if}

<style>
  .field { margin-bottom: 20px; }
  label { font-weight: 600; display: block; margin-bottom: 4px; }
  input[type="number"] { width: 80px; padding: 4px 8px; border: 1px solid #ccc; border-radius: 4px; }
  .help { font-size: 13px; color: #666; margin: 4px 0 0; }
  button { padding: 8px 20px; background: #0066cc; color: white; border: none; border-radius: 4px; cursor: pointer; }
  button:hover { background: #0052a3; }
  .saved { color: #28a745; margin-left: 12px; }
  .sync-btn { padding: 8px 20px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; }
  .sync-btn:hover { background: #218838; }
  .sync-btn:disabled { background: #ccc; cursor: not-allowed; }
</style>
