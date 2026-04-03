<script lang="ts">
  import { authState, signInWithGoogle, signInWithWikimedia, signInWithEmail, signUpWithEmail, signOut } from "$lib/stores/auth.svelte";
  import { syncState, enableSync, disableSync, syncNow, upgradeToAuthenticatedUser } from "$lib/stores/sync.svelte";
  import { getDeviceId } from "$lib/stores/device-id";
  import { db } from "$lib/stores/db";
  import { onMount } from "svelte";

  let syncEnabled = $state(localStorage.getItem("syncEnabled") === "true");
  let deviceId = $state("");

  let email = $state("");
  let password = $state("");
  let isSignUp = $state(false);
  let authError = $state("");
  let authSubmitting = $state(false);

  onMount(() => {
    deviceId = getDeviceId();
  });

  // Persist syncEnabled to localStorage whenever it changes
  $effect(() => {
    localStorage.setItem("syncEnabled", String(syncEnabled));
    if (!syncEnabled) {
      disableSync();
    }
  });

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric", month: "long", day: "numeric",
      hour: "numeric", minute: "2-digit",
    });
  }

  $effect(() => {
    if (!syncEnabled) {
      disableSync();
    }
  });

  async function handleGoogleSignIn() {
    authError = "";
    const result = await signInWithGoogle();
    if (result.error) authError = result.error;
  }

  async function handleWikimediaSignIn() {
    authError = "";
    const result = await signInWithWikimedia();
    if (result.error) authError = result.error;
  }

  async function handleEmailSubmit() {
    authError = "";
    authSubmitting = true;
    const result = isSignUp
      ? await signUpWithEmail(email, password)
      : await signInWithEmail(email, password);
    if (result.error) {
      authError = result.error;
    } else if (authState.user && !authState.user.is_anonymous) {
      localStorage.setItem("pendingAuthUpgrade", "true");
      await upgradeToAuthenticatedUser(authState.user.id);
      localStorage.removeItem("pendingAuthUpgrade");
      syncEnabled = true;
    }
    authSubmitting = false;
  }

  let showSignOutDialog = $state(false);
  let signingOut = $state(false);

  async function handleSignOutWithSync() {
    signingOut = true;
    await syncNow();
    await clearLocalData();
    await signOut();
    disableSync();
    syncEnabled = false;
    signingOut = false;
    showSignOutDialog = false;
  }

  async function handleSignOutWithout() {
    await clearLocalData();
    await signOut();
    disableSync();
    syncEnabled = false;
    showSignOutDialog = false;
  }

  async function clearLocalData() {
    await db.trails.clear();
    await db.visits.clear();
    await db.conflictLogs.clear();
    localStorage.removeItem("lastSyncTime");
  }

  const deviceIdShort = $derived(deviceId ? deviceId.slice(0, 8) + "…" : "—");
</script>

<h1>Settings</h1>

<div class="field">
  <label class="toggle-label">
    <input type="checkbox" bind:checked={syncEnabled} />
    Sync to cloud
  </label>
  <p class="help">Back up and sync trails across devices.</p>
</div>

{#if syncEnabled}
  <hr />

  <div class="section">
    <h3>Account</h3>

    {#if authState.loading}
      <p class="help">Loading...</p>
    {:else if authState.isAuthenticated}
      <p>Signed in as
        {#if authState.user?.user_metadata?.provider === "wikimedia"}
          <span class="provider-icon" title="Wikipedia">
            <svg viewBox="0 0 97.75 97.75" width="16" height="16" fill="currentColor"><path d="M48.875,0C21.883,0,0,21.883,0,48.875S21.883,97.75,48.875,97.75S97.75,75.867,97.75,48.875S75.867,0,48.875,0z M77.691,37.503c-2.779,6.28-11.279,26.171-16.951,39.136c-0.008,0.006-1.486-0.003-1.49-0.005l-8.945-21.069c-3.545,6.953-7.473,14.181-10.832,21.059c-0.02,0.035-1.625,0.016-1.627-0.006c-5.135-11.986-10.459-23.893-15.621-35.87c-1.195-2.928-5.387-7.637-8.256-7.61c0-0.34-0.016-1.099-0.02-1.558l17.682-0.002l-0.014,1.531c-2.076,0.096-5.664,1.421-4.734,3.713c2.492,5.381,11.316,26.227,13.701,31.519c1.664-3.257,6.311-11.939,8.225-15.609c-1.5-3.078-6.457-14.57-7.943-17.464c-1.121-1.887-3.934-2.118-6.1-2.151c0-0.483,0.025-0.855,0.016-1.518l15.543,0.048v1.412c-2.104,0.058-4.096,0.841-3.193,2.853c2.091,4.34,3.312,7.43,5.231,11.444c0.613-1.176,3.755-7.622,5.253-11.024c0.905-2.262-0.447-3.109-4.232-3.211c0.05-0.372,0.017-1.119,0.05-1.475l13.424,0.013l0.006,1.401c-2.467,0.096-5.021,1.41-6.354,3.45l-6.464,13.406c0.709,1.773,6.924,15.58,7.578,17.111L74.988,36.18c-0.951-2.497-3.984-3.055-5.17-3.082c0.008-0.398,0.01-1.005,0.012-1.512l13.951,0.04l0.02,0.07l-0.023,1.394C80.717,33.183,78.824,34.82,77.691,37.503z"/></svg>
          </span>
        {:else if authState.user?.app_metadata?.provider === "google"}
          <span class="provider-icon" title="Google">
            <svg viewBox="0 0 24 24" width="16" height="16"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
          </span>
        {/if}
        <strong>{authState.user?.user_metadata?.wikimedia_username ?? authState.user?.email ?? "Unknown"}</strong>
      </p>
      <button class="btn-secondary" onclick={() => { showSignOutDialog = true; }}>Sign out</button>

      <hr />

      <div class="section">
        <h3>Sync</h3>
        <button class="btn-sync" onclick={syncNow} disabled={syncState.syncing}>
          {syncState.syncing ? "Syncing…" : "Sync now"}
        </button>
        <p class="help">
          Last synced: {syncState.lastSyncTime ? formatDate(syncState.lastSyncTime) : "Never"}
        </p>
        <p class="help device-id" title={deviceId}>Device ID: {deviceIdShort}</p>
      </div>
    {:else}
      <p class="help" style="margin-bottom: 12px;">Sign in to enable cloud backup and sync.</p>

      <button class="btn-google" onclick={handleGoogleSignIn}>
        Sign in with Google
      </button>

      <button class="btn-wikimedia" onclick={handleWikimediaSignIn}>
        Sign in with Wikipedia
      </button>

      <div class="divider"><span>or</span></div>

      <form onsubmit={(e) => { e.preventDefault(); handleEmailSubmit(); }}>
        <input type="email" placeholder="Email" bind:value={email} required />
        <input type="password" placeholder="Password" bind:value={password} required minlength="6" />
        <button type="submit" class="btn-primary" disabled={authSubmitting}>
          {authSubmitting ? "..." : isSignUp ? "Sign up" : "Sign in"}
        </button>
      </form>

      <button class="toggle-mode" onclick={() => { isSignUp = !isSignUp; authError = ""; }}>
        {isSignUp ? "Already have an account? Sign in" : "Need an account? Sign up"}
      </button>

      {#if authError}
        <p class="error">{authError}</p>
      {/if}
    {/if}
  </div>
{/if}

{#if showSignOutDialog}
  <div class="dialog-overlay">
    <div class="dialog">
      <h3>Sign out</h3>
      <p>Local trail data will be removed from this device. Make sure your data is synced before signing out.</p>
      <div class="dialog-actions">
        <button class="btn-primary" onclick={handleSignOutWithSync} disabled={signingOut}>
          {signingOut ? "Syncing..." : "Sync & sign out"}
        </button>
        <button class="btn-secondary" onclick={handleSignOutWithout}>Sign out without syncing</button>
        <button class="btn-cancel" onclick={() => { showSignOutDialog = false; }}>Cancel</button>
      </div>
    </div>
  </div>
{/if}

<style>
  h1 { margin: 0 0 20px; font-size: 24px; }
  h3 { margin: 0 0 12px; font-size: 18px; }
  .field { margin-bottom: 20px; }
  .section { margin-bottom: 20px; }
  .help { font-size: 13px; color: #666; margin: 4px 0 0; }
  hr { border: none; border-top: 1px solid #eee; margin: 24px 0; }

  .toggle-label {
    display: flex; align-items: center; gap: 8px;
    font-size: 14px; font-weight: 600; cursor: pointer;
  }
  .toggle-label input { cursor: pointer; width: 16px; height: 16px; }

  .provider-icon { display: inline-flex; vertical-align: middle; margin-left: 4px; }
  .signed-in p { margin: 0; }

  .btn-google {
    width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px;
    background: white; cursor: pointer; font-size: 14px; font-weight: 500;
  }
  .btn-google:hover { background: #f8f8f8; }
  .btn-wikimedia {
    width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px;
    background: white; cursor: pointer; font-size: 14px; font-weight: 500;
    margin-top: 8px;
  }
  .btn-wikimedia:hover { background: #f8f8f8; }
  .btn-primary {
    padding: 10px; background: #0066cc; color: white; border: none;
    border-radius: 4px; cursor: pointer; font-size: 14px; width: 100%;
  }
  .btn-primary:hover { background: #0052a3; }
  .btn-primary:disabled { background: #ccc; }
  .btn-secondary {
    padding: 6px 16px; border: 1px solid #ddd; border-radius: 4px;
    background: white; cursor: pointer; font-size: 13px; color: #1a1a1a;
  }
  .btn-sync {
    padding: 7px 16px; background: #0066cc; color: white; border: none;
    border-radius: 7px; cursor: pointer; font-size: 13px; font-weight: 500;
  }
  .btn-sync:hover:not(:disabled) { background: #0055aa; }
  .btn-sync:disabled { opacity: 0.5; cursor: default; }

  .divider {
    display: flex; align-items: center; gap: 12px; margin: 16px 0;
    color: #999; font-size: 12px;
  }
  .divider::before, .divider::after { content: ""; flex: 1; border-top: 1px solid #eee; }
  form { display: flex; flex-direction: column; gap: 8px; }
  input[type="email"], input[type="password"] { padding: 8px 12px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; }
  .toggle-mode {
    background: none; border: none; color: #0066cc; cursor: pointer;
    font-size: 13px; padding: 8px 0; text-align: center; width: 100%;
  }
  .error { color: #dc3545; font-size: 13px; margin-top: 8px; }

  .dialog-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 100; }
  .dialog { background: white; border-radius: 12px; padding: 20px; max-width: 400px; width: 90%; }
  .dialog h3 { margin: 0 0 8px; }
  .dialog p { font-size: 13px; color: #666; margin: 0 0 16px; }
  .dialog-actions { display: flex; flex-direction: column; gap: 8px; }
  .dialog-actions .btn-primary { width: 100%; }
  .dialog-actions .btn-secondary { width: 100%; padding: 10px; }
  .btn-cancel {
    background: none; border: none; color: #666; cursor: pointer;
    font-size: 13px; padding: 8px; text-align: center;
  }
  .device-id { font-family: monospace; font-size: 12px; }
</style>
