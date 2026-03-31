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
  const isOAuthCallback = window.location.hash.includes("access_token");

  // Set up persistent listener
  supabase.auth.onAuthStateChange((event, session) => {
    console.log("[pwa] Auth state change:", event, session?.user?.email ?? "no user");
    _user = session?.user ?? null;
    _loading = false;
  });

  if (isOAuthCallback) {
    console.log("[pwa] Detected OAuth callback, waiting for session...");
    // Wait for Supabase to process the hash and fire SIGNED_IN
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        console.log("[pwa] OAuth callback timeout — session not established");
        resolve();
      }, 5000);
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
          console.log("[pwa] OAuth session established");
          clearTimeout(timeout);
          subscription.unsubscribe();
          resolve();
        }
      });
    });
    // Clean URL
    window.history.replaceState({}, "", window.location.pathname);
  } else {
    // Normal startup — check existing session
    const { data } = await supabase.auth.getSession();
    if (data.session?.user) {
      _user = data.session.user;
    }
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
