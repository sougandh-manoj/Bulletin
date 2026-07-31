import { NextResponse } from "next/server";

import { getSupabaseAuthEnvironment } from "@/env/server";
import { PRIVATE_RESPONSE_HEADERS } from "@/lib/security/constants";
import { getSupabaseAuthClient } from "@/lib/supabase/auth";

export const runtime = "nodejs";

type AuthIntent = "create" | "manage";
type AuthProvider = "apple" | "google";
const APPLE_SIGN_IN_ENABLED = false;

function normalizeIntent(value: string | null): AuthIntent {
  return value === "manage" ? "manage" : "create";
}

function normalizeProvider(value: string | null): AuthProvider {
  return value === "apple" ? "apple" : "google";
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const intent = normalizeIntent(requestUrl.searchParams.get("intent"));
  const provider = normalizeProvider(requestUrl.searchParams.get("provider"));
  if (provider === "apple" && !APPLE_SIGN_IN_ENABLED) {
    const destination = new URL("/sign-in", requestUrl.origin);
    destination.searchParams.set("intent", intent);
    destination.searchParams.set("provider", provider);
    destination.searchParams.set("state", "coming-soon");
    return NextResponse.redirect(destination, {
      status: 303,
      headers: PRIVATE_RESPONSE_HEADERS,
    });
  }
  const environment = getSupabaseAuthEnvironment();
  const supabase = await getSupabaseAuthClient();
  const callback = new URL("/auth/callback", environment.APP_BASE_URL);
  callback.searchParams.set("intent", intent);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: callback.toString(),
      ...(provider === "google"
        ? {
            queryParams: {
              access_type: "offline",
              prompt: "select_account",
            },
          }
        : {}),
    },
  });

  if (error || !data.url) {
    const destination = new URL("/sign-in", requestUrl.origin);
    destination.searchParams.set("intent", intent);
    destination.searchParams.set("provider", provider);
    destination.searchParams.set("state", "unavailable");
    return NextResponse.redirect(destination, {
      status: 303,
      headers: PRIVATE_RESPONSE_HEADERS,
    });
  }

  return NextResponse.redirect(data.url, {
    status: 303,
    headers: PRIVATE_RESPONSE_HEADERS,
  });
}
