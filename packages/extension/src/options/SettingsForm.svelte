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

  async function loadAuthStatus() {
    const response = await chrome.runtime.sendMessage({ type: "getAuthStatus" });
    if (response?.success) authStatus = response.data;
  }

  async function handleGoogleSignIn() {
    authError = "";
    try {
      // Use launchWebAuthFlow to get an ID token
      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;
      const redirectUrl = chrome.identity.getRedirectURL();
      const rawNonce = crypto.randomUUID();
      // Google embeds a SHA-256 hash of the nonce in the ID token.
      // We send the hashed nonce to Google and the raw nonce to Supabase.
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

  // Load sync status on mount
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
    <div class="auth-section">
      <h3>Account</h3>
      {#if authStatus?.isAuthenticated}
        <p>Signed in as <strong>{authStatus.email}</strong></p>
        <button type="button" onclick={handleSignOut}>Sign out</button>
      {:else}
        <p class="help">{authStatus?.isAnonymous ? "Sign in to sync across devices." : "Sign in to enable sync."}</p>
        <button type="button" onclick={handleGoogleSignIn}>Sign in with Google</button>
        <div style="margin: 8px 0; text-align: center; color: #999; font-size: 12px;">or</div>
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <input type="email" placeholder="Email" bind:value={authEmail} />
          <input type="password" placeholder="Password" bind:value={authPassword} />
          <button type="button" onclick={handleEmailAuth} disabled={authSubmitting}>
            {authSubmitting ? "..." : authIsSignUp ? "Sign up" : "Sign in"}
          </button>
        </div>
        <button type="button" style="background: none; border: none; color: #0066cc; cursor: pointer; font-size: 12px; margin-top: 4px;" onclick={() => { authIsSignUp = !authIsSignUp; authError = ""; }}>
          {authIsSignUp ? "Already have an account? Sign in" : "Need an account? Sign up"}
        </button>
        {#if authError}<p style="color: #dc3545; font-size: 12px;">{authError}</p>{/if}
      {/if}
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

  </div>
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
  .sync-btn { padding: 8px 20px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; }
  .sync-btn:hover { background: #218838; }
  .sync-btn:disabled { background: #ccc; cursor: not-allowed; }
</style>
