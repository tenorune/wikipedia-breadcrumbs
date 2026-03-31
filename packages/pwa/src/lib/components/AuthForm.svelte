<script lang="ts">
  import {
    authState, signInWithGoogle, signInWithEmail, signUpWithEmail, signOut
  } from "$lib/stores/auth.svelte";
  import { upgradeToAuthenticatedUser } from "$lib/stores/sync.svelte";

  let email = $state("");
  let password = $state("");
  let isSignUp = $state(false);
  let error = $state("");
  let submitting = $state(false);

  async function handleEmailSubmit() {
    error = "";
    submitting = true;
    const result = isSignUp
      ? await signUpWithEmail(email, password)
      : await signInWithEmail(email, password);
    if (result.error) {
      error = result.error;
    } else if (authState.user && !authState.user.is_anonymous) {
      localStorage.setItem("pendingAuthUpgrade", "true");
      await upgradeToAuthenticatedUser(authState.user.id);
      localStorage.removeItem("pendingAuthUpgrade");
    }
    submitting = false;
  }

  async function handleGoogleSignIn() {
    error = "";
    const result = await signInWithGoogle();
    if (result.error) error = result.error;
    // Redirect happens — upgrade runs after redirect back via layout init
  }

  async function handleSignOut() {
    await signOut();
  }
</script>

<div class="auth-section">
  <h3>Account</h3>

  {#if authState.loading}
    <p class="help">Loading...</p>
  {:else if authState.isAuthenticated}
    <div class="signed-in">
      <p>Signed in as <strong>{authState.user?.email ?? "Unknown"}</strong></p>
      <button class="btn-secondary" onclick={handleSignOut}>Sign out</button>
    </div>
  {:else}
    <p class="help">
      {authState.isAnonymous
        ? "Sign in to sync across devices."
        : "Sign in to enable cross-device sync."}
    </p>

    <button class="btn-google" onclick={handleGoogleSignIn}>
      Sign in with Google
    </button>

    <div class="divider"><span>or</span></div>

    <form onsubmit={(e) => { e.preventDefault(); handleEmailSubmit(); }}>
      <input type="email" placeholder="Email" bind:value={email} required />
      <input type="password" placeholder="Password" bind:value={password} required minlength="6" />
      <button type="submit" class="btn-primary" disabled={submitting}>
        {submitting ? "..." : isSignUp ? "Sign up" : "Sign in"}
      </button>
    </form>

    <button class="toggle-mode" onclick={() => { isSignUp = !isSignUp; error = ""; }}>
      {isSignUp ? "Already have an account? Sign in" : "Need an account? Sign up"}
    </button>

    {#if error}
      <p class="error">{error}</p>
    {/if}
  {/if}
</div>

<style>
  h3 { margin: 0 0 12px; font-size: 18px; }
  .help { font-size: 13px; color: #666; margin: 0 0 12px; }
  .signed-in { display: flex; align-items: center; gap: 12px; }
  .signed-in p { margin: 0; }
  .btn-google {
    width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px;
    background: white; cursor: pointer; font-size: 14px; font-weight: 500;
  }
  .btn-google:hover { background: #f8f8f8; }
  .divider {
    display: flex; align-items: center; gap: 12px; margin: 16px 0;
    color: #999; font-size: 12px;
  }
  .divider::before, .divider::after { content: ""; flex: 1; border-top: 1px solid #eee; }
  form { display: flex; flex-direction: column; gap: 8px; }
  input { padding: 8px 12px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; }
  .btn-primary {
    padding: 10px; background: #0066cc; color: white; border: none;
    border-radius: 4px; cursor: pointer; font-size: 14px;
  }
  .btn-primary:hover { background: #0052a3; }
  .btn-primary:disabled { background: #ccc; }
  .btn-secondary {
    padding: 6px 16px; border: 1px solid #ddd; border-radius: 4px;
    background: white; cursor: pointer; font-size: 13px;
  }
  .toggle-mode {
    background: none; border: none; color: #0066cc; cursor: pointer;
    font-size: 13px; padding: 8px 0; text-align: center; width: 100%;
  }
  .error { color: #dc3545; font-size: 13px; margin-top: 8px; }
</style>
