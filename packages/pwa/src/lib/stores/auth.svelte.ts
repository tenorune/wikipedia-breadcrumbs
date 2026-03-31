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
  supabase.auth.onAuthStateChange((_event, session) => {
    _user = session?.user ?? null;
    _loading = false;
  });
  const { data } = await supabase.auth.getSession();
  _user = data.session?.user ?? null;
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
