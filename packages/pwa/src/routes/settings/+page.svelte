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
        <p>Signed in as
          {#if authState.user?.user_metadata?.provider === "wikimedia"}
            <span class="provider-icon" title="Wikipedia">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12.09 13.119c-.14 1.064-.496 2.4-1.063 3.783-.567 1.383-1.2 2.727-1.762 3.56a.1.1 0 0 1-.085.045H7.93a.1.1 0 0 1-.091-.058L4.005 11.3a.1.1 0 0 1 .091-.142h1.887a.1.1 0 0 1 .091.058l2.453 5.81c.167-.468.396-1.09.687-1.862l1.57-4.032a.1.1 0 0 1 .093-.064h1.904a.1.1 0 0 1 .092.063l2.522 5.885c.348-.926.673-1.863.937-2.645l1.136-3.318a.1.1 0 0 1 .094-.066h1.882a.1.1 0 0 1 .091.142l-3.67 9.149a.1.1 0 0 1-.092.058h-1.312a.1.1 0 0 1-.086-.048c-.825-1.356-1.61-3.065-2.168-4.692z"/><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 1.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17z"/></svg>
            </span>
          {:else}
            <span class="provider-icon" title="Google">
              <svg viewBox="0 0 24 24" width="16" height="16"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            </span>
          {/if}
          <strong>{authState.user?.user_metadata?.wikimedia_username ?? authState.user?.email ?? "Unknown"}</strong>
        </p>
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
  .provider-icon { display: inline-flex; vertical-align: middle; margin-right: 4px; }
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
