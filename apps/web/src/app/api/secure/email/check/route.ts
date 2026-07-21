import { z } from "zod";

import { createLogger } from "@/lib/logging/logger";
import { invalidRequest, privateJson, rateLimited, unavailable } from "@/lib/security/api";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { readJsonBody } from "@/lib/security/request";
import { subscriberEmailSchema } from "@/lib/validation/subscriber";
import { resendForEmail } from "@/services/access";

export const runtime = "nodejs";
const logger = createLogger("email-check");

export async function POST(request: Request) {
  try {
    const parsed = subscriberEmailSchema.safeParse(await readJsonBody(request, 2_000));
    if (!parsed.success) return invalidRequest("Enter a valid email address.");

    const allowed = await enforceRateLimit({
      request,
      scope: "email-check",
      discriminator: parsed.data.email,
      limit: 5,
      windowSeconds: 15 * 60,
    });
    if (!allowed) return rateLimited();

    const result = await resendForEmail(parsed.data.email);
    logger.info("Early email check completed", { state: result.state });

    if (result.state === "new" || result.state === "expired") {
      return privateJson({ ok: true, state: result.state });
    }
    return privateJson({ ok: true, state: result.state, emailSent: true });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return invalidRequest();
    }
    logger.error("Early email check failed", { error });
    return unavailable();
  }
}
