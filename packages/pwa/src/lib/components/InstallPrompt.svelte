<script lang="ts">
  import { installState, dismissInstallPrompt, triggerInstall } from "$lib/stores/install.svelte";

  let {
    needsSyncFirst = false,
    syncing = false,
    isOnline = true,
    onSync = () => {},
  } = $props();

  let showSteps = $state(false);
</script>

<div class="install-card">
  <button class="dismiss" onclick={dismissInstallPrompt} aria-label="Dismiss install prompt">&times;</button>
  <p class="install-text">Install Wikipedia Breadcrumbs for quick access from your home screen</p>
  {#if installState.platform === "android" && installState.hasNativeInstall}
    <button class="install-btn" onclick={triggerInstall}>Install</button>
  {/if}
  {#if !showSteps}
    {#if installState.platform === "android" && installState.hasNativeInstall}
      <button class="manual-link" onclick={() => { showSteps = true; }}>or install manually</button>
    {:else}
      <button class="install-btn" onclick={() => { showSteps = true; }}>How to install</button>
    {/if}
  {:else if needsSyncFirst}
    <p class="sync-nudge">
      <strong>First, sync before installing</strong> ·
      {#if isOnline}
        <button class="sync-link" onclick={onSync} disabled={syncing}>{syncing ? "Syncing…" : "Sync"}</button>
      {:else}
        <span class="offline">(offline)</span>
      {/if}
    </p>
  {:else}
    <ol class="install-steps">
      {#if installState.platform === "ios"}
        <li>
          Tap the share
          <svg class="step-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
          in the {installState.iosBrowser === "safari" ? "browser toolbar" : "URL bar"}
        </li>
        <li>
          Scroll down and pick
          <svg class="step-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
          <strong>Add to Home Screen</strong>
        </li>
      {:else}
        <li>
          Tap
          <svg class="step-icon" viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
          in the top right
        </li>
        <li>Pick <strong>Install app</strong> or <strong>Add to Home Screen</strong></li>
      {/if}
      <li>
        Look for the
        <img src="/icons/icon-192.png" class="step-app-icon" width="30" height="30" alt="Breadcrumbs app icon">
        icon on your home screen
      </li>
    </ol>
  {/if}
</div>

<style>
  .install-card {
    position: relative;
    background: #f8f9fa;
    border-radius: 10px;
    padding: 16px 20px;
    margin-bottom: 16px;
  }
  .dismiss {
    position: absolute;
    top: 8px;
    right: 12px;
    background: none;
    border: none;
    font-size: 18px;
    color: #999;
    cursor: pointer;
    padding: 0;
    line-height: 1;
  }
  .dismiss:hover { color: #666; }
  .install-text {
    font-size: 14px;
    margin: 0 0 12px;
    padding-right: 20px;
  }
  .install-btn {
    background: #0066cc;
    color: white;
    border: none;
    border-radius: 6px;
    padding: 8px 20px;
    font-size: 14px;
    cursor: pointer;
  }
  .install-btn:hover { background: #0052a3; }
  .manual-link {
    display: block;
    background: none;
    border: none;
    color: #0066cc;
    font-size: 12px;
    cursor: pointer;
    padding: 0;
    margin-top: 8px;
  }
  .manual-link:hover { text-decoration: underline; }
  .install-steps {
    margin: 8px 0 0;
    padding-left: 24px;
    font-size: 13px;
    color: #444;
    line-height: 1.8;
  }
  .install-steps li {
    margin-bottom: 4px;
  }
  .step-icon {
    vertical-align: middle;
  }
  .step-app-icon {
    vertical-align: middle;
    border-radius: 4px;
  }
  .sync-nudge {
    font-size: 13px;
    color: #444;
    margin: 0;
  }
  .sync-link {
    background: none;
    border: none;
    color: #0066cc;
    cursor: pointer;
    font-size: 13px;
    padding: 0;
  }
  .sync-link:hover { text-decoration: underline; }
  .sync-link:disabled { color: #999; cursor: default; text-decoration: none; }
  .offline { color: #999; font-style: italic; }
</style>
