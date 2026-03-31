import type { User } from "@supabase/supabase-js";
import { supabase } from "$lib/supabase";

let _user = $state<User | null>(null);
let _loading = $state(true);

export const authState = {
  get user() { return _user; },
  get isAuthenticated() { return _user !== null && !_user.is_anonymous; },
  get isAnonymous() { return _user?.is_anonymous ?? false; },
  get loading() { return _loading; },
};

export async function initAuth(): Promise<void> {
  // Set up listener FIRST — this catches the OAuth callback token exchange
  supabase.auth.onAuthStateChange((event, session) => {
    console.log("[pwa] Auth state change:", event, session?.user?.email ?? "no user");
    _user = session?.user ?? null;
    _loading = false;
  });

  // If returning from OAuth redirect, the URL hash contains session tokens.
  // Supabase's `exchangeCodeForSession` or `getSession` should detect this,
  // but we need to ensure it runs before anything else claims the session.
  if (window.location.hash.includes("access_token")) {
    console.log("[pwa] Detected OAuth callback hash, exchanging tokens...");
    // Supabase JS auto-detects hash params when `detectSessionInUrl` is true (default).
    // Calling getUser forces the exchange to happen now.
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      console.error("[pwa] Token exchange failed:", error.message);
      // Clear the stale session and try again from the hash
      await supabase.auth.signOut({ scope: "local" });
      // Supabase should now re-detect the hash tokens
      const { data: retryData } = await supabase.auth.getUser();
      if (retryData?.user) {
        _user = retryData.user;
      }
    } else if (data?.user) {
      _user = data.user;
    }
    // Clean up the hash from the URL
    if (window.location.hash) {
      history.replaceState(null, "", window.location.pathname);
    }
    _loading = false;
    return;
  }

  // Normal startup — check for existing session
  const { data } = await supabase.auth.getSession();
  if (data.session?.user) {
    _user = data.session.user;
  }
  _loading = false;
}

export async function signInWithGoogle(): Promise<{ error?: string }> {
  localStorage.setItem("pendingAuthUpgrade", "true");
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin + "/settings" },
  });
  if (error) return { error: error.message };
  return {};
}

export async function signUpWithEmail(email: string, password: string): Promise<{ error?: string }> {
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) return { error: error.message };
  return {};
}

export async function signInWithEmail(email: string, password: string): Promise<{ error?: string }> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };
  return {};
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
  _user = null;
}
