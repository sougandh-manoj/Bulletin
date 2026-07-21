import { z } from "zod";

import { deleteSubscriber } from "@/data/subscribers";
import { getSecureAccessEnvironment } from "@/env/server";
import { createLogger } from "@/lib/logging/logger";
import { invalidRequest, privateJson, unavailable } from "@/lib/security/api";
import { hasValidSameOrigin, readJsonBody } from "@/lib/security/request";
import {
  clearSubscriberSessionCookie,
  getAuthenticatedSubscriber,
} from "@/lib/security/session";

export const runtime = "nodejs";
const logger = createLogger("subscriber-delete");
const requestSchema = z.object({
  csrfToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  confirmation: z.literal("DELETE"),
});

export async function POST(request: Request) {
  try {
    const environment = getSecureAccessEnvironment();
    if (!hasValidSameOrigin(request, environment.APP_BASE_URL)) {
      return privateJson({ ok: false, message: "This deletion request was rejected." }, { status: 403 });
    }
    const parsed = requestSchema.safeParse(await readJsonBody(request, 2_000));
    if (!parsed.success) return invalidRequest("Type DELETE to confirm.");
    const authenticated = await getAuthenticatedSubscriber({ csrfToken: parsed.data.csrfToken });
    if (!authenticated) {
      return privateJson({ ok: false, message: "Your secure session has expired." }, { status: 401 });
    }
    const deleted = await deleteSubscriber(authenticated.subscriber.subscriberId);
    if (!deleted) return unavailable();
    await clearSubscriberSessionCookie();
    logger.info("Subscriber personal data deleted through confirmed POST");
    return privateJson({ ok: true });
  } catch (error) {
    if (error instanceof SyntaxError) return invalidRequest();
    logger.error("Confirmed subscriber deletion failed", { error });
    return unavailable();
  }
}
