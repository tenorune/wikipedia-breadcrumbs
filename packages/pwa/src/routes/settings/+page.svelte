<script lang="ts">
  import { authState, signInWithGoogle, signInWithWikimedia, signInWithEmail, signUpWithEmail, signOut } from "$lib/stores/auth.svelte";
  import { syncState, enableSync, disableSync, syncNow, upgradeToAuthenticatedUser } from "$lib/stores/sync.svelte";
  import { getDeviceId } from "$lib/stores/device-id";
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

  async function handleSignOut() {
    await signOut();
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
      <div class="signed-in">
        <p>Signed in as <strong>{authState.user?.email ?? "Unknown"}</strong></p>
        <button class="btn-secondary" onclick={handleSignOut}>Sign out</button>
      </div>

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

  .signed-in { display: flex; align-items: center; gap: 12px; }
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
  .device-id { font-family: monospace; font-size: 12px; }
</style>
