import { NextResponse } from "next/server";

import { createLogger } from "@/lib/logging/logger";
import { establishAdminSession } from "@/lib/security/admin-session";
import { PRIVATE_RESPONSE_HEADERS } from "@/lib/security/constants";

export const runtime = "nodejs";

const logger = createLogger("owner-access-exchange");

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("t") ?? "";
  let accepted = false;
  if (/^[A-Za-z0-9_-]{43}$/.test(token)) {
    accepted = await establishAdminSession(token).catch(() => false);
  }
  if (!accepted) logger.warn("Owner access exchange rejected");
  return NextResponse.redirect(
    new URL(accepted ? "/internal/operations" : "/internal/access?state=invalid", request.url),
    { status: 303, headers: PRIVATE_RESPONSE_HEADERS },
  );
}
