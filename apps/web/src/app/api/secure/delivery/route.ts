import { z } from "zod";

import { pauseSubscriber, resumeSubscriber } from "@/data/subscribers";
import { getSecureAccessEnvironment } from "@/env/server";
import { createLogger } from "@/lib/logging/logger";
import { invalidRequest, privateJson, unavailable } from "@/lib/security/api";
import { getAuthenticatedBulletinSubscriber } from "@/lib/security/authenticated-subscriber";
import { hasValidSameOrigin, readJsonBody } from "@/lib/security/request";

export const runtime = "nodejs";
const logger = createLogger("delivery-control");
const requestSchema = z.object({
  csrfToken: z.string().optional(),
  action: z.enum(["pause", "resume"]),
});

export async function POST(request: Request) {
  try {
    const environment = getSecureAccessEnvironment();
    if (!hasValidSameOrigin(request, environment.APP_BASE_URL)) {
      return privateJson({ ok: false, message: "This delivery request was rejected." }, { status: 403 });
    }
    const parsed = requestSchema.safeParse(await readJsonBody(request, 2_000));
    if (!parsed.success) return invalidRequest();
    const authenticated = await getAuthenticatedBulletinSubscriber();
    if (!authenticated?.subscriber) {
      return privateJson({ ok: false, message: "Your secure session has expired." }, { status: 401 });
    }
    let nextDeliveryAt: string | null = null;
    if (parsed.data.action === "pause") {
      await pauseSubscriber(authenticated.subscriber.subscriberId);
    } else {
      nextDeliveryAt = await resumeSubscriber(authenticated.subscriber.subscriberId);
    }
    logger.info("Subscriber delivery state changed", { action: parsed.data.action });
    return privateJson({ ok: true, status: parsed.data.action === "pause" ? "paused" : "active", nextDeliveryAt });
  } catch (error) {
    if (error instanceof SyntaxError) return invalidRequest();
    logger.error("Delivery state change failed", { error });
    return unavailable();
  }
}
