import { z } from "zod";

import { saveSubscriberTheme } from "@/data/subscribers";
import { getSecureAccessEnvironment } from "@/env/server";
import { createLogger } from "@/lib/logging/logger";
import { invalidRequest, privateJson, unavailable } from "@/lib/security/api";
import { hasValidSameOrigin, readJsonBody } from "@/lib/security/request";
import { getAuthenticatedSubscriber } from "@/lib/security/session";
import { briefingThemeSchema } from "@/lib/validation/subscriber";
import { isVersionConflict } from "@/services/access";

export const runtime = "nodejs";
const logger = createLogger("theme-save");
const requestSchema = briefingThemeSchema.extend({
  csrfToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});

export async function POST(request: Request) {
  try {
    const environment = getSecureAccessEnvironment();
    if (!hasValidSameOrigin(request, environment.APP_BASE_URL)) {
      return privateJson({ ok: false, message: "This theme request was rejected." }, { status: 403 });
    }
    const parsed = requestSchema.safeParse(await readJsonBody(request, 2_000));
    if (!parsed.success) return invalidRequest();
    const authenticated = await getAuthenticatedSubscriber({ csrfToken: parsed.data.csrfToken });
    if (!authenticated) {
      return privateJson({ ok: false, message: "Your secure session has expired." }, { status: 401 });
    }
    const version = await saveSubscriberTheme({
      subscriberId: authenticated.subscriber.subscriberId,
      expectedVersion: parsed.data.expectedVersion,
      theme: parsed.data.theme,
    });
    logger.info("Subscriber theme saved immediately");
    return privateJson({ ok: true, version });
  } catch (error) {
    if (error instanceof SyntaxError) return invalidRequest();
    if (isVersionConflict(error)) {
      return privateJson({ ok: false, conflict: true, message: "Your theme changed in another session. Reload and try again." }, { status: 409 });
    }
    logger.error("Immediate theme save failed", { error });
    return unavailable();
  }
}
