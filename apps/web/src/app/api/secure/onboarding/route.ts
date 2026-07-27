import { createPendingSubscriber, findSubscriberForManagement } from "@/data/subscribers";
import { createLogger } from "@/lib/logging/logger";
import { invalidRequest, privateJson, rateLimited, unavailable } from "@/lib/security/api";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { readJsonBody } from "@/lib/security/request";
import { subscriberPreferencesSchema } from "@/lib/validation/subscriber";
import {
  issueManagementEmail,
  issueVerificationEmailForSubscriber,
} from "@/services/access";

export const runtime = "nodejs";
const logger = createLogger("onboarding-submit");

export async function POST(request: Request) {
  try {
    const parsed = subscriberPreferencesSchema.safeParse(
      await readJsonBody(request),
    );
    if (!parsed.success) {
      return invalidRequest("Review every choice before generating your briefing.");
    }

    const allowed = await enforceRateLimit({
      request,
      scope: "verification-request",
      discriminator: parsed.data.email,
      limit: 4,
      windowSeconds: 60 * 60,
    });
    if (!allowed) return rateLimited();

    const result = await createPendingSubscriber(parsed.data);

    if (result.outcome === "existing-verified") {
      const subscriber = await findSubscriberForManagement(result.subscriber_id);
      if (!subscriber) return unavailable();
      await issueManagementEmail({
        email: parsed.data.email,
        publicReference: subscriber.public_reference,
        tokenVersion: subscriber.token_version,
      });
      logger.info("Onboarding protected an existing verified subscriber");
      return privateJson({ ok: true, state: "verified", emailSent: true });
    }

    await issueVerificationEmailForSubscriber({
      subscriberId: result.subscriber_id,
      email: parsed.data.email,
    });
    logger.info("Pending subscriber verification issued", {
      outcome: result.outcome,
    });
    return privateJson({ ok: true, state: "pending", emailSent: true });
  } catch (error) {
    if (error instanceof SyntaxError) return invalidRequest();
    logger.error("Onboarding submission failed", { error });
    return unavailable();
  }
}
