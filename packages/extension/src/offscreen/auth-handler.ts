import { createSupabaseClient } from "@wikipedia-breadcrumbs/shared";
import type { SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

let supabaseClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    supabaseClient = createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return supabaseClient;
}

export async function handleAuthMessage(
  type: string,
  payload: Record<string, unknown>
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const supabase = getSupabaseClient();

  switch (type) {
    case "signInWithGoogle": {
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: "google",
        token: payload.idToken as string,
      });
      if (error) return { success: false, error: error.message };
      return { success: true, data: { user: data.user } };
    }
    case "signInWithEmail": {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: payload.email as string,
        password: payload.password as string,
      });
      if (error) return { success: false, error: error.message };
      return { success: true, data: { user: data.user } };
    }
    case "signUpWithEmail": {
      const { data, error } = await supabase.auth.signUp({
        email: payload.email as string,
        password: payload.password as string,
      });
      if (error) return { success: false, error: error.message };
      return { success: true, data: { user: data.user } };
    }
    case "signOut": {
      await supabase.auth.signOut();
      return { success: true };
    }
    case "getAuthStatus": {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user ?? null;
      return {
        success: true,
        data: {
          user,
          isAuthenticated: user !== null && !user.is_anonymous,
          isAnonymous: user?.is_anonymous ?? false,
          email: user?.email ?? null,
        },
      };
    }
    default:
      return { success: false, error: `Unknown auth message: ${type}` };
  }
}
