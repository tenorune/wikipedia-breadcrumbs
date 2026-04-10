import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface SupabaseStorageAdapter {
  getItem(key: string): Promise<string | null> | string | null;
  setItem(key: string, value: string): Promise<void> | void;
  removeItem(key: string): Promise<void> | void;
}

export function createSupabaseClient(
  url: string,
  anonKey: string,
  storage?: SupabaseStorageAdapter,
): SupabaseClient {
  return createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      ...(storage ? { storage } : {}),
    },
  });
}

export type { SupabaseClient } from "@supabase/supabase-js";
