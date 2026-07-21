import { createLogger } from "@/lib/logging/logger";
import { invalidRequest, privateJson, rateLimited, unavailable } from "@/lib/security/api";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { readJsonBody } from "@/lib/security/request";
import { subscriberEmailSchema } from "@/lib/validation/subscriber";
import { resendForEmail } from "@/services/access";

export const runtime = "nodejs";
const logger = createLogger("verification-resend");

export async function POST(request: Request) {
  try {
    const parsed = subscriberEmailSchema.safeParse(await readJsonBody(request, 2_000));
    if (!parsed.success) return invalidRequest("Enter a valid email address.");

    const allowed = await enforceRateLimit({
      request,
      scope: "verification-request",
      discriminator: parsed.data.email,
      limit: 4,
      windowSeconds: 60 * 60,
    });
    if (!allowed) return rateLimited();

    const result = await resendForEmail(parsed.data.email);
    if (result.state === "new" || result.state === "expired") {
      return privateJson(
        { ok: false, state: result.state, message: "Start a fresh briefing request." },
        { status: 409 },
      );
    }
    logger.info("Subscriber access email reissued", { state: result.state });
    return privateJson({ ok: true, state: result.state, emailSent: true });
  } catch (error) {
    if (error instanceof SyntaxError) return invalidRequest();
    logger.error("Subscriber access email resend failed", { error });
    return unavailable();
  }
}
