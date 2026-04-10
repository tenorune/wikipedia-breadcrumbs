import { createSupabaseClient } from "@wikipedia-breadcrumbs/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import { chromeStorageAdapter } from "./supabase-storage.js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

let supabaseClient: SupabaseClient | null = null;
let clientInitialized = false;

export function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    supabaseClient = createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY, chromeStorageAdapter);
    clientInitialized = false;
  }
  return supabaseClient;
}

/**
 * Ensure the Supabase client has recovered its session from chrome.storage.local
 * and refreshed the access token if needed. Must be called before getSession()
 * after a service worker restart, since the async storage adapter means
 * initialization is not instant.
 */
async function ensureSessionRecovered(): Promise<void> {
  if (clientInitialized) return;
  const supabase = getSupabaseClient();
  await supabase.auth.getSession();
  await supabase.auth.startAutoRefresh();
  clientInitialized = true;
}

export { ensureSessionRecovered };

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
  await ensureSessionRecovered();
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
