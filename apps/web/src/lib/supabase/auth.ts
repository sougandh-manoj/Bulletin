import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { getSupabaseAuthEnvironment } from "@/env/server";

export async function getSupabaseAuthClient() {
  const environment = getSupabaseAuthEnvironment();
  const cookieStore = await cookies();

  return createServerClient(
    environment.SUPABASE_URL,
    environment.SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Components cannot write cookies. Route handlers can.
          }
        },
      },
    },
  );
}

export async function getSupabaseAuthUser() {
  const supabase = await getSupabaseAuthClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
}
