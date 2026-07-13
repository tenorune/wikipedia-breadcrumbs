<script lang="ts">
  import { syncState, enableSync, disableSync, syncNow } from "$lib/stores/sync.svelte";
  import { getDeviceId } from "$lib/stores/device-id";

  let deviceId = $state("");
  import { onMount } from "svelte";
  onMount(() => {
    deviceId = getDeviceId();
  });

  const deviceIdShort = $derived(deviceId ? deviceId.slice(0, 8) + "…" : "—");

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric", month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit",
    });
  }

  async function handleSyncToggle(e: Event) {
    const checked = (e.target as HTMLInputElement).checked;
    if (checked) {
      await enableSync();
    } else {
      disableSync();
    }
  }
</script>

<div class="sync-status">
  <div class="row">
    <label class="toggle-label">
      <input
        type="checkbox"
        checked={syncState.syncEnabled}
        onchange={handleSyncToggle}
      />
      Enable sync
    </label>
  </div>

  {#if syncState.syncEnabled}
    <div class="row">
      <button
        class="sync-now"
        onclick={syncNow}
        disabled={syncState.syncing}
      >
        {syncState.syncing ? "Syncing…" : "Sync now"}
      </button>
    </div>
  {/if}

  <div class="info-row">
    <span class="info-label">Last synced</span>
    <span class="info-value">
      {syncState.lastSyncTime ? formatDate(syncState.lastSyncTime) : "Never"}
    </span>
  </div>

  {#if syncState.syncError}
    <details class="sync-error">
      <summary>Last sync failed — {syncState.syncError}</summary>
      {#if syncState.lastReport && syncState.lastReport.errors.length > 0}
        <ul>
          {#each syncState.lastReport.errors as error}
            <li>{error}</li>
          {/each}
        </ul>
      {/if}
    </details>
  {/if}

  <div class="info-row">
    <span class="info-label">Device ID</span>
    <span class="info-value mono" title={deviceId}>{deviceIdShort}</span>
  </div>
</div>

<style>
  .sync-status {
    background: #fafafa;
    border: 1px solid #e0e0e0;
    border-radius: 10px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .row { display: flex; align-items: center; gap: 8px; }

  .toggle-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    cursor: pointer;
    user-select: none;
  }
  .toggle-label input { cursor: pointer; width: 16px; height: 16px; }

  .sync-now {
    padding: 7px 16px;
    background: #0066cc;
    color: white;
    border: none;
    border-radius: 7px;
    font-size: 13px;
    cursor: pointer;
    font-weight: 500;
  }
  .sync-now:hover:not(:disabled) { background: #0055aa; }
  .sync-now:disabled { opacity: 0.5; cursor: default; }

  .info-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 13px;
  }
  .info-label { color: #666; }
  .info-value { color: #222; font-weight: 500; }
  .mono { font-family: monospace; font-size: 12px; }

  .sync-error { font-size: 13px; color: #dc3545; }
  .sync-error summary { cursor: pointer; }
  .sync-error ul {
    margin: 6px 0 0;
    padding-left: 18px;
    font-size: 12px;
    color: #666;
    font-family: monospace;
  }
</style>
