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

  // Then check for existing session
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
