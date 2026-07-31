import { z } from "zod";

import {
  isSubscriberVersionConflict,
  saveSubscriberPreferences,
} from "@/data/subscribers";
import { getSecureAccessEnvironment } from "@/env/server";
import { createLogger } from "@/lib/logging/logger";
import { invalidRequest, privateJson, unavailable } from "@/lib/security/api";
import { getAuthenticatedBulletinSubscriber } from "@/lib/security/authenticated-subscriber";
import { hasValidSameOrigin, readJsonBody } from "@/lib/security/request";
import { managedPreferencesSchema } from "@/lib/validation/subscriber";

export const runtime = "nodejs";
const logger = createLogger("preference-save");
const requestSchema = z.object({
  csrfToken: z.string().optional(),
  expectedVersion: z.number().int().min(1),
  preferences: managedPreferencesSchema,
});

export async function POST(request: Request) {
  try {
    const environment = getSecureAccessEnvironment();
    if (!hasValidSameOrigin(request, environment.APP_BASE_URL)) {
      return privateJson({ ok: false, message: "This save request was rejected." }, { status: 403 });
    }
    const parsed = requestSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) return invalidRequest("Review every preference before saving.");
    const authenticated = await getAuthenticatedBulletinSubscriber();
    if (!authenticated?.subscriber) {
      return privateJson({ ok: false, message: "Your secure session has expired." }, { status: 401 });
    }

    const saved = await saveSubscriberPreferences({
      subscriberId: authenticated.subscriber.subscriberId,
      expectedVersion: parsed.data.expectedVersion,
      preferences: parsed.data.preferences,
    });
    logger.info("Subscriber preferences saved atomically");
    return privateJson({ ok: true, ...saved });
  } catch (error) {
    if (error instanceof SyntaxError) return invalidRequest();
    if (isSubscriberVersionConflict(error)) {
      return privateJson(
        { ok: false, conflict: true, message: "This briefing changed in another session. Reload before saving again." },
        { status: 409 },
      );
    }
    logger.error("Subscriber preference save failed", { error });
    return unavailable();
  }
}
