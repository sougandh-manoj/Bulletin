import { NextResponse } from "next/server";

import { PRIVATE_RESPONSE_HEADERS } from "@/lib/security/constants";
import { getSupabaseAuthClient } from "@/lib/supabase/auth";

export const runtime = "nodejs";

type AuthIntent = "create" | "manage";

function normalizeIntent(value: string | null): AuthIntent {
  return value === "manage" ? "manage" : "create";
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const intent = normalizeIntent(requestUrl.searchParams.get("intent"));
  const destination = new URL(intent === "manage" ? "/manage" : "/onboarding", requestUrl.origin);

  if (!code) {
    destination.searchParams.set("auth", "invalid");
    return NextResponse.redirect(destination, {
      status: 303,
      headers: PRIVATE_RESPONSE_HEADERS,
    });
  }

  const supabase = await getSupabaseAuthClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    destination.searchParams.set("auth", "unavailable");
    return NextResponse.redirect(destination, {
      status: 303,
      headers: PRIVATE_RESPONSE_HEADERS,
    });
  }

  return NextResponse.redirect(destination, {
    status: 303,
    headers: PRIVATE_RESPONSE_HEADERS,
  });
}
