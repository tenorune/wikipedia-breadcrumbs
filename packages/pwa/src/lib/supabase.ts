import { createSupabaseClient } from "@wikipedia-breadcrumbs/shared";
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from "$env/static/public";

export const supabase = createSupabaseClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);
