import { NextResponse } from "next/server";

import { getSupabaseAuthEnvironment } from "@/env/server";
import { PRIVATE_RESPONSE_HEADERS } from "@/lib/security/constants";
import { hasValidSameOrigin } from "@/lib/security/request";
import { getSupabaseAuthClient } from "@/lib/supabase/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const environment = getSupabaseAuthEnvironment();
  if (!hasValidSameOrigin(request, environment.APP_BASE_URL)) {
    return new NextResponse(null, {
      status: 403,
      headers: PRIVATE_RESPONSE_HEADERS,
    });
  }

  const supabase = await getSupabaseAuthClient();
  const { error } = await supabase.auth.signOut();
  const destination = new URL(error ? "/sign-in?intent=manage&state=logout-failed" : "/", environment.APP_BASE_URL);

  return NextResponse.redirect(destination, {
    status: 303,
    headers: PRIVATE_RESPONSE_HEADERS,
  });
}
