<script lang="ts">
  import { installState, dismissInstallPrompt, triggerInstall } from "$lib/stores/install.svelte";

  let showIosSteps = $state(false);
</script>

<div class="install-card">
  <button class="dismiss" onclick={dismissInstallPrompt} aria-label="Dismiss install prompt">&times;</button>
  <p class="install-text">Install Wikipedia Breadcrumbs for quick access from your home screen</p>
  {#if installState.platform === "android"}
    <button class="install-btn" onclick={triggerInstall}>Install</button>
  {:else if installState.platform === "ios"}
    {#if showIosSteps}
      <p class="ios-steps">
        Tap the share icon
        <svg class="share-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
        then "Add to Home Screen"
      </p>
    {:else}
      <button class="install-btn" onclick={() => { showIosSteps = true; }}>How to install</button>
    {/if}
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
  .ios-steps {
    font-size: 13px;
    color: #666;
    margin: 0;
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
  }
  .share-icon { vertical-align: middle; flex-shrink: 0; }
</style>
