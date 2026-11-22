import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * Supabase client for the staff portal. Uses the public anon key + the
 * signed-in user's cookie session, so every query runs under Postgres RLS
 * as that user. Never use the service role here.
 */
export function portalEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && anonKey ? { url, anonKey } : null;
}

export async function getPortalClient(): Promise<SupabaseClient | null> {
  // read cookies first so every portal page is rendered per request (never prerendered)
  const cookieStore = await cookies();
  const env = portalEnv();
  if (!env) return null;
  return createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component: middleware refreshes the session instead.
        }
      },
    },
  });
}
