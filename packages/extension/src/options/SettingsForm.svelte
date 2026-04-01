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
      <p class="help">Sync trails to Supabase.</p>
    </div>

    {#if settings.syncEnabled}
      <hr />

      <div class="section">
        <h3>Account</h3>
        {#if authStatus?.isAuthenticated}
          <p>Signed in as <strong>{authStatus.email}</strong></p>
          <button type="button" class="btn-secondary" onclick={handleSignOut}>Sign out</button>
        {:else}
          <p class="help">{authStatus?.isAnonymous ? "Sign in to sync across devices." : "Sign in to enable sync."}</p>
          <button type="button" class="btn-google" onclick={handleGoogleSignIn}>Sign in with Google</button>
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
