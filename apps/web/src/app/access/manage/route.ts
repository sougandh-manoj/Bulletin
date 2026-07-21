import { NextResponse } from "next/server";

import { findSubscriberForManagement } from "@/data/subscribers";
import { getSecureAccessEnvironment } from "@/env/server";
import { createLogger } from "@/lib/logging/logger";
import { PRIVATE_RESPONSE_HEADERS } from "@/lib/security/constants";
import { verifyManagementClaims } from "@/lib/security/crypto";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { establishSubscriberSession } from "@/lib/security/session";

export const runtime = "nodejs";
const logger = createLogger("management-link");

function invalidDestination(origin: string, state: string) {
  const destination = new URL("/manage/access", origin);
  destination.searchParams.set("state", state);
  return destination;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const publicReference = requestUrl.searchParams.get("r") ?? "";
  const signature = requestUrl.searchParams.get("s") ?? "";
  const tokenVersion = Number(requestUrl.searchParams.get("v"));
  const expiresAt = Number(requestUrl.searchParams.get("e"));

  try {
    const allowed = await enforceRateLimit({
      request,
      scope: "token-validation",
      discriminator: `${publicReference}:${signature}`,
      limit: 20,
      windowSeconds: 15 * 60,
    });
    if (!allowed) {
      return NextResponse.redirect(invalidDestination(requestUrl.origin, "limited"), {
        status: 303,
        headers: PRIVATE_RESPONSE_HEADERS,
      });
    }

    const environment = getSecureAccessEnvironment();
    if (!verifyManagementClaims(
      { publicReference, tokenVersion, expiresAt, signature },
      environment.MANAGEMENT_LINK_SIGNING_SECRET,
    )) {
      return NextResponse.redirect(invalidDestination(requestUrl.origin, "invalid"), {
        status: 303,
        headers: PRIVATE_RESPONSE_HEADERS,
      });
    }

    const subscriber = await findSubscriberForManagement(publicReference);
    if (
      !subscriber ||
      subscriber.status === "pending" ||
      subscriber.token_version !== tokenVersion
    ) {
      return NextResponse.redirect(invalidDestination(requestUrl.origin, "invalid"), {
        status: 303,
        headers: PRIVATE_RESPONSE_HEADERS,
      });
    }

    await establishSubscriberSession({
      subscriberId: subscriber.id,
      tokenVersion: subscriber.token_version,
    });
    logger.info("Management link exchanged for a clean subscriber session");
    return NextResponse.redirect(new URL("/manage", requestUrl.origin), {
      status: 303,
      headers: PRIVATE_RESPONSE_HEADERS,
    });
  } catch (error) {
    logger.error("Management link exchange failed", { error });
    return NextResponse.redirect(invalidDestination(requestUrl.origin, "unavailable"), {
      status: 303,
      headers: PRIVATE_RESPONSE_HEADERS,
    });
  }
}
