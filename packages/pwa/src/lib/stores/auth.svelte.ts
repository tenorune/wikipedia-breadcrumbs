import type { User } from "@supabase/supabase-js";
import { supabase } from "$lib/supabase";
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from "$env/static/public";

let _user = $state<User | null>(null);
let _loading = $state(true);

export const authState = {
  get user() { return _user; },
  get isAuthenticated() { return _user !== null && !_user.is_anonymous; },
  get isAnonymous() { return _user?.is_anonymous ?? false; },
  get loading() { return _loading; },
};

export async function initAuth(): Promise<void> {
  // Set up persistent listener
  supabase.auth.onAuthStateChange((event, session) => {
    console.log("[pwa] Auth state change:", event, session?.user?.email ?? "no user");
    _user = session?.user ?? null;
    _loading = false;
  });

  // Check if returning from OAuth redirect — hash contains access_token + refresh_token
  if (window.location.hash.includes("access_token")) {
    console.log("[pwa] Detected OAuth callback, extracting tokens...");
    const params = new URLSearchParams(window.location.hash.substring(1));
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");

    if (accessToken && refreshToken) {
      // Manually set the session from the hash tokens
      const { data, error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) {
        console.error("[pwa] Failed to set session from OAuth tokens:", error.message);
      } else {
        console.log("[pwa] OAuth session established:", data.user?.email);
        _user = data.user;
      }
    }

    // Clean the hash from the URL
    window.history.replaceState({}, "", window.location.pathname);
    _loading = false;
    return;
  }

  // Normal startup — check existing session
  const { data } = await supabase.auth.getSession();
  if (data.session?.user) {
    _user = data.session.user;
  }
  _loading = false;
}

export async function signInWithGoogle(): Promise<{ error?: string }> {
  localStorage.setItem("pendingAuthUpgrade", "true");
  // Sign out the anonymous session first so it doesn't conflict with the OAuth callback
  await supabase.auth.signOut({ scope: "local" });
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin + "/settings" },
  });
  if (error) return { error: error.message };
  return {};
}

export async function signInWithWikimedia(): Promise<{ error?: string }> {
  localStorage.setItem("pendingAuthUpgrade", "true");
  const { data: session } = await supabase.auth.getSession();
  if (session?.session?.user?.is_anonymous) {
    await supabase.auth.signOut({ scope: "local" });
  }
  try {
    const supabaseUrl = PUBLIC_SUPABASE_URL;
    const supabaseKey = PUBLIC_SUPABASE_ANON_KEY;
    const redirectTo = window.location.origin + "/settings";
    const resp = await fetch(
      `${supabaseUrl}/functions/v1/wikimedia-oauth?action=authorize&redirect_to=${encodeURIComponent(redirectTo)}`,
      { headers: { "apikey": supabaseKey, "Authorization": `Bearer ${supabaseKey}` } }
    );
    const { url } = await resp.json();
    if (url) {
      window.location.href = url;
      return {};
    }
    return { error: "Failed to get authorization URL" };
  } catch (err: any) {
    return { error: err.message ?? "Wikimedia sign-in failed" };
  }
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
