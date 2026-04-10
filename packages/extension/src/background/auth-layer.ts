import { createSupabaseClient } from "@wikipedia-breadcrumbs/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import { chromeStorageAdapter } from "./supabase-storage.js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

let supabaseClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    supabaseClient = createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY, chromeStorageAdapter);
  }
  return supabaseClient;
}

export async function signInWithGoogle(idToken: string, nonce: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: idToken,
    nonce,
  });
  if (error) return { success: false as const, error: error.message };
  return { success: true as const, data: { user: data.user } };
}

export async function signInWithWikimedia(accessToken: string, refreshToken: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error) return { success: false as const, error: error.message };
  return { success: true as const, data: { user: data.user } };
}

export async function signInWithEmail(email: string, password: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { success: false as const, error: error.message };
  return { success: true as const, data: { user: data.user } };
}

export async function signUpWithEmail(email: string, password: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return { success: false as const, error: error.message };
  return { success: true as const, data: { user: data.user } };
}

export async function signOut() {
  const supabase = getSupabaseClient();
  await supabase.auth.signOut();
  return { success: true as const };
}

export async function getAuthStatus() {
  const supabase = getSupabaseClient();
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user ?? null;
  return {
    success: true as const,
    data: {
      user,
      isAuthenticated: user !== null && !user.is_anonymous,
      isAnonymous: user?.is_anonymous ?? false,
      email: user?.email ?? null,
    },
  };
}
