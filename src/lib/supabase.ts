import { createClient, type SupabaseClient, type User, type Session } from '@supabase/supabase-js';

// Access browser-safe public credentials only
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

let supabaseInstance: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (supabaseInstance) {
    return supabaseInstance;
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('[Supabase Client] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing.');
    return null;
  }

  try {
    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
    return supabaseInstance;
  } catch (err) {
    console.error('[Supabase Client] Failed to initialize Supabase client:', err);
    return null;
  }
}

export type { User, Session };
