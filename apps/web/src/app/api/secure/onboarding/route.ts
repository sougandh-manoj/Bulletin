import { createAuthenticatedSubscriber } from "@/data/subscribers";
import { createLogger } from "@/lib/logging/logger";
import { invalidRequest, privateJson, unavailable } from "@/lib/security/api";
import { getAuthenticatedAuthUser } from "@/lib/security/authenticated-subscriber";
import { readJsonBody } from "@/lib/security/request";
import { subscriberPreferencesSchema } from "@/lib/validation/subscriber";

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

    const authenticated = await getAuthenticatedAuthUser();
    if (!authenticated) {
      return privateJson(
        { ok: false, message: "Sign in before creating your briefing." },
        { status: 401 },
      );
    }

    if (parsed.data.email !== authenticated.email) {
      return privateJson(
        { ok: false, message: "Use the email from your signed-in account." },
        { status: 403 },
      );
    }

    const result = await createAuthenticatedSubscriber({
      authUserId: authenticated.user.id,
      preferences: parsed.data,
    });
    if (result.outcome === "email-claimed") {
      return privateJson(
        { ok: false, state: "email-claimed", message: "This email is already connected to another Bulletin account." },
        { status: 409 },
      );
    }
    logger.info("Authenticated subscriber onboarding completed", {
      outcome: result.outcome,
    });
    return privateJson({
      ok: true,
      state: result.outcome,
      nextDeliveryAt: result.next_delivery_at,
    });
  } catch (error) {
    if (error instanceof SyntaxError) return invalidRequest();
    logger.error("Onboarding submission failed", { error });
    return unavailable();
  }
}
