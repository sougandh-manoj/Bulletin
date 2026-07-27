import { NextResponse } from "next/server";

import { inspectVerificationToken } from "@/data/subscribers";
import { createLogger } from "@/lib/logging/logger";
import {
  PRIVATE_RESPONSE_HEADERS,
  VERIFICATION_COOKIE_NAME,
  VERIFICATION_INTENT_TTL_SECONDS,
} from "@/lib/security/constants";
import {
  createOpaqueToken,
  hashValue,
  toPostgresBytea,
} from "@/lib/security/crypto";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
const logger = createLogger("verification-link");

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const token = requestUrl.searchParams.get("t") ?? "";
  const destination = new URL("/verify", requestUrl.origin);

  try {
    const allowed = await enforceRateLimit({
      request,
      scope: "token-validation",
      discriminator: token || "malformed",
      limit: 20,
      windowSeconds: 15 * 60,
    });
    if (!allowed) {
      destination.searchParams.set("state", "limited");
      return NextResponse.redirect(destination, { status: 303, headers: PRIVATE_RESPONSE_HEADERS });
    }

    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
      destination.searchParams.set("state", "invalid");
      return NextResponse.redirect(destination, { status: 303, headers: PRIVATE_RESPONSE_HEADERS });
    }

    const inspection = await inspectVerificationToken(
      toPostgresBytea(hashValue(token)),
    );
    if (!inspection?.is_valid) {
      destination.searchParams.set("state", "invalid");
      return NextResponse.redirect(destination, { status: 303, headers: PRIVATE_RESPONSE_HEADERS });
    }

    const intent = createOpaqueToken();
    const response = NextResponse.redirect(destination, {
      status: 303,
      headers: PRIVATE_RESPONSE_HEADERS,
    });
    response.cookies.set(VERIFICATION_COOKIE_NAME, `${token}.${intent}`, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: VERIFICATION_INTENT_TTL_SECONDS,
      priority: "high",
    });
    logger.info("Verification link inspected without consuming it");
    return response;
  } catch (error) {
    logger.error("Verification link inspection failed", { error });
    destination.searchParams.set("state", "unavailable");
    return NextResponse.redirect(destination, { status: 303, headers: PRIVATE_RESPONSE_HEADERS });
  }
}
