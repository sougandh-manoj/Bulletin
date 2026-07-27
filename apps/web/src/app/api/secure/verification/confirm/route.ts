import { cookies } from "next/headers";
import { z } from "zod";

import {
  consumeVerificationToken,
  findSubscriberForManagement,
  inspectVerificationToken,
  loadSubscriberThemeForVerification,
} from "@/data/subscribers";
import { getSecureAccessEnvironment } from "@/env/server";
import { createLogger } from "@/lib/logging/logger";
import { invalidRequest, privateJson, rateLimited, unavailable } from "@/lib/security/api";
import { VERIFICATION_COOKIE_NAME } from "@/lib/security/constants";
import {
  hashValue,
  parseSessionCookie,
  toPostgresBytea,
} from "@/lib/security/crypto";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { hasValidSameOrigin, readJsonBody } from "@/lib/security/request";
import {
  clearSubscriberSessionCookie,
  establishSubscriberSession,
} from "@/lib/security/session";

export const runtime = "nodejs";
const logger = createLogger("verification-confirm");
const confirmationSchema = z.object({
  intent: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/).optional(),
});

export async function POST(request: Request) {
  try {
    const environment = getSecureAccessEnvironment();
    if (!hasValidSameOrigin(request, environment.APP_BASE_URL)) {
      return privateJson({ ok: false, message: "This confirmation request was rejected." }, { status: 403 });
    }

    const parsedBody = confirmationSchema.safeParse(await readJsonBody(request, 2_000));
    if (!parsedBody.success) return invalidRequest();

    const cookieStore = await cookies();
    const verification = parseSessionCookie(
      cookieStore.get(VERIFICATION_COOKIE_NAME)?.value,
    );
    const sessionToken = verification?.csrfToken === parsedBody.data.intent
      ? verification.sessionToken
      : parsedBody.data.token;
    if (!sessionToken) {
      return privateJson({ ok: false, message: "This verification page has expired." }, { status: 409 });
    }

    const allowed = await enforceRateLimit({
      request,
      scope: "token-validation",
      discriminator: sessionToken,
      limit: 10,
      windowSeconds: 15 * 60,
    });
    if (!allowed) return rateLimited();

    const tokenHash = toPostgresBytea(hashValue(sessionToken));
    const inspection = await inspectVerificationToken(tokenHash);
    const theme = inspection?.subscriber_public_reference
      ? await loadSubscriberThemeForVerification(inspection.subscriber_public_reference)
      : null;
    if (!theme) return unavailable();

    const consumed = await consumeVerificationToken(tokenHash, theme);
    const subscriber = await findSubscriberForManagement(
      consumed.subscriber_public_reference,
    );
    if (!subscriber || subscriber.status === "pending") return unavailable();

    await clearSubscriberSessionCookie();
    await establishSubscriberSession({
      subscriberId: subscriber.id,
      tokenVersion: subscriber.token_version,
    });
    cookieStore.set(VERIFICATION_COOKIE_NAME, "", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      expires: new Date(0),
    });
    logger.info("Verification token consumed exactly once and delivery activated");
    return privateJson({
      ok: true,
      nextDeliveryAt: consumed.next_delivery_at,
      theme,
    });
  } catch (error) {
    logger.warn("Verification confirmation rejected", { error });
    return privateJson(
      { ok: false, message: "This verification link is no longer available. Request a fresh email." },
      { status: 409 },
    );
  }
}
