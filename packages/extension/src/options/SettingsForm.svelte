<script lang="ts">
  import { getSettings, updateSettings, type ExtensionSettings } from "../shared/settings.js";

  let settings: ExtensionSettings | null = $state(null);
  let syncing = $state(false);
  let syncStatus: any = $state(null);

  let authStatus: any = $state(null);
  let authEmail = $state("");
  let authPassword = $state("");
  let authIsSignUp = $state(false);
  let authError = $state("");
  let authSubmitting = $state(false);

  async function loadSyncStatus() {
    const { lastSyncTime } = await chrome.storage.local.get("lastSyncTime");
    syncStatus = { lastSyncTime: lastSyncTime ?? null };
  }

  async function handleSyncNow() {
    syncing = true;
    const { lastSyncTime: beforeSync } = await chrome.storage.local.get("lastSyncTime");
    chrome.runtime.sendMessage({ type: "syncNow" });
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

  async function loadAuthStatus() {
    const response = await chrome.runtime.sendMessage({ type: "getAuthStatus" });
    if (response?.success) authStatus = response.data;
  }

  async function handleGoogleSignIn() {
    authError = "";
    try {
      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;
      const redirectUrl = chrome.identity.getRedirectURL();
      const rawNonce = crypto.randomUUID();
      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(rawNonce));
      const hashedNonce = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&response_type=id_token&redirect_uri=${encodeURIComponent(redirectUrl)}&scope=openid%20email%20profile&nonce=${hashedNonce}`;

      const responseUrl = await chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true });
      const idToken = new URL(responseUrl!.replace("#", "?")).searchParams.get("id_token");
      if (!idToken) {
        authError = "No ID token received from Google";
        return;
      }

      const response = await chrome.runtime.sendMessage({ type: "signInWithGoogle", idToken, nonce: rawNonce });
      if (response?.success) {
        await loadAuthStatus();
        await chrome.runtime.sendMessage({ type: "reinitSync" });
      } else {
        authError = response?.error ?? "Sign-in failed";
      }
    } catch (err) {
      authError = String(err);
    }
  }

  async function handleWikimediaSignIn() {
    authError = "";
    const response = await chrome.runtime.sendMessage({ type: "signInWithWikimedia" });
    if (response?.success) {
      await loadAuthStatus();
      await chrome.runtime.sendMessage({ type: "reinitSync" });
    } else {
      authError = response?.error ?? "Wikipedia sign-in failed";
    }
  }

  async function handleEmailAuth() {
    authError = "";
    authSubmitting = true;
    const type = authIsSignUp ? "signUpWithEmail" : "signInWithEmail";
    const response = await chrome.runtime.sendMessage({
      type, email: authEmail, password: authPassword,
    });
    if (response?.success) {
      await loadAuthStatus();
      await chrome.runtime.sendMessage({ type: "reinitSync" });
    } else {
      authError = response?.error ?? "Auth failed";
    }
    authSubmitting = false;
  }

  async function handleSignOut() {
    await chrome.runtime.sendMessage({ type: "signOut" });
    await loadAuthStatus();
  }

  loadAuthStatus();
  loadSyncStatus();

  async function load() {
    settings = await getSettings();
  }

  async function autoSave() {
    if (settings) await updateSettings(settings);
  }

  load();
</script>

{#if settings}
  <div>
    <div class="field">
      <label for="idle-timeout">Idle timeout (minutes)</label>
      <input id="idle-timeout" type="number" min="5" max="120" bind:value={settings.idleTimeoutMinutes} onchange={autoSave} />
      <p class="help">A new trail starts after this many minutes of no Wikipedia navigation in a tab.</p>
    </div>
    <div class="field">
      <label>
        <input type="checkbox" bind:checked={settings.captureEnabled} onchange={autoSave} />
        Capture enabled
      </label>
      <p class="help">When disabled, no new visits are recorded.</p>
    </div>
    <div class="field">
      <label>
        <input type="checkbox" bind:checked={settings.syncEnabled} onchange={autoSave} />
        Sync to cloud
      </label>
      <p class="help">Back up and sync trails across devices.</p>
    </div>

    {#if settings.syncEnabled}
      <hr />

      <div class="section">
        <h3>Account</h3>
        {#if authStatus?.isAuthenticated}
          <p>Signed in as
            {#if authStatus.user?.user_metadata?.provider === "wikimedia"}
              <span class="provider-icon" title="Wikipedia"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12.09 13.119c-.14 1.064-.496 2.4-1.063 3.783-.567 1.383-1.2 2.727-1.762 3.56a.1.1 0 0 1-.085.045H7.93a.1.1 0 0 1-.091-.058L4.005 11.3a.1.1 0 0 1 .091-.142h1.887a.1.1 0 0 1 .091.058l2.453 5.81c.167-.468.396-1.09.687-1.862l1.57-4.032a.1.1 0 0 1 .093-.064h1.904a.1.1 0 0 1 .092.063l2.522 5.885c.348-.926.673-1.863.937-2.645l1.136-3.318a.1.1 0 0 1 .094-.066h1.882a.1.1 0 0 1 .091.142l-3.67 9.149a.1.1 0 0 1-.092.058h-1.312a.1.1 0 0 1-.086-.048c-.825-1.356-1.61-3.065-2.168-4.692z"/><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 1.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17z"/></svg></span>
            {:else}
              <span class="provider-icon" title="Google"><svg viewBox="0 0 24 24" width="16" height="16"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg></span>
            {/if}
            <strong>{authStatus.user?.user_metadata?.wikimedia_username ?? authStatus.email}</strong>
          </p>
          <button type="button" class="btn-secondary" onclick={handleSignOut}>Sign out</button>

          <hr />

          <div class="section">
            <h3>Sync</h3>
            <button type="button" class="btn-sync" onclick={handleSyncNow} disabled={syncing}>
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
        {:else}
          <p class="help" style="margin-bottom: 12px;">Sign in to enable cloud backup and sync.</p>
          <button type="button" class="btn-google" onclick={handleGoogleSignIn}>Sign in with Google</button>
          <button type="button" class="btn-wikimedia" onclick={handleWikimediaSignIn}>Sign in with Wikipedia</button>
          <div class="divider"><span>or</span></div>
          <div class="email-form">
            <input type="email" placeholder="Email" bind:value={authEmail} />
            <input type="password" placeholder="Password" bind:value={authPassword} />
            <button type="button" class="btn-primary" onclick={handleEmailAuth} disabled={authSubmitting}>
              {authSubmitting ? "..." : authIsSignUp ? "Sign up" : "Sign in"}
            </button>
          </div>
          <button type="button" class="toggle-mode" onclick={() => { authIsSignUp = !authIsSignUp; authError = ""; }}>
            {authIsSignUp ? "Already have an account? Sign in" : "Need an account? Sign up"}
          </button>
          {#if authError}<p class="error">{authError}</p>{/if}
        {/if}
      </div>
    {/if}
  </div>
{:else}
  <p>Loading...</p>
{/if}

<style>
  .field { margin-bottom: 20px; }
  .section { margin-bottom: 20px; }
  h3 { margin: 0 0 12px; font-size: 18px; }
  label { font-weight: 600; display: block; margin-bottom: 4px; }
  input[type="number"] { width: 80px; padding: 4px 8px; border: 1px solid #ccc; border-radius: 4px; }
  .help { font-size: 13px; color: #666; margin: 4px 0 0; }
  hr { border: none; border-top: 1px solid #eee; margin: 24px 0; }

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
  .provider-icon { display: inline-flex; vertical-align: middle; margin-right: 4px; }
  .btn-secondary {
    padding: 6px 16px; border: 1px solid #ddd; border-radius: 4px;
    background: white; cursor: pointer; font-size: 13px; color: #1a1a1a;
  }
  .btn-sync {
    padding: 7px 16px; background: #0066cc; color: white; border: none;
    border-radius: 4px; cursor: pointer; font-size: 14px;
  }
  .btn-sync:hover:not(:disabled) { background: #0055aa; }
  .btn-sync:disabled { opacity: 0.5; cursor: default; }

  .divider {
    display: flex; align-items: center; gap: 12px; margin: 16px 0;
    color: #999; font-size: 12px;
  }
  .divider::before, .divider::after { content: ""; flex: 1; border-top: 1px solid #eee; }
  .email-form { display: flex; flex-direction: column; gap: 8px; }
  .email-form input { padding: 8px 12px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; }
  .toggle-mode {
    background: none; border: none; color: #0066cc; cursor: pointer;
    font-size: 13px; padding: 8px 0; text-align: center; width: 100%;
  }
  .error { color: #dc3545; font-size: 13px; margin-top: 8px; }
</style>
