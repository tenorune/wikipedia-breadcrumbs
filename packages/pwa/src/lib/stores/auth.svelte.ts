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
  // Set up listener — this catches OAuth callback, sign-in, sign-out events
  supabase.auth.onAuthStateChange((event, session) => {
    console.log("[pwa] Auth state change:", event, session?.user?.email ?? "no user");
    _user = session?.user ?? null;
    _loading = false;
  });

  // Check for existing session
  const { data } = await supabase.auth.getSession();
  if (data.session?.user) {
    _user = data.session.user;
  }
  _loading = false;

  // If returning from OAuth redirect, Supabase auto-detects the hash tokens
  // via onAuthStateChange (SIGNED_IN event). We just need to wait for it.
  if (window.location.hash.includes("access_token")) {
    console.log("[pwa] Detected OAuth callback, waiting for session...");
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, 3000);
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_IN") {
          clearTimeout(timeout);
          subscription.unsubscribe();
          resolve();
        }
      });
    });
    // Clean up the hash from the URL
    const { replaceState } = await import("$app/navigation");
    replaceState("/settings", {});
  }
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
