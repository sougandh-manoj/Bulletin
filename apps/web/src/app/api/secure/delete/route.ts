import { z } from "zod";

import { deleteSubscriber } from "@/data/subscribers";
import { getSecureAccessEnvironment } from "@/env/server";
import { createLogger } from "@/lib/logging/logger";
import { invalidRequest, privateJson, unavailable } from "@/lib/security/api";
import { getAuthenticatedBulletinSubscriber } from "@/lib/security/authenticated-subscriber";
import { hasValidSameOrigin, readJsonBody } from "@/lib/security/request";
import { getSupabaseAuthClient } from "@/lib/supabase/auth";

export const runtime = "nodejs";
const logger = createLogger("subscriber-delete");
const requestSchema = z.object({
  csrfToken: z.string().optional(),
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
    const authenticated = await getAuthenticatedBulletinSubscriber();
    if (!authenticated?.subscriber) {
      return privateJson({ ok: false, message: "Your secure session has expired." }, { status: 401 });
    }
    const deleted = await deleteSubscriber(authenticated.subscriber.subscriberId);
    if (!deleted) return unavailable();
    const supabase = await getSupabaseAuthClient();
    await supabase.auth.signOut();
    logger.info("Subscriber personal data deleted through confirmed POST");
    return privateJson({ ok: true });
  } catch (error) {
    if (error instanceof SyntaxError) return invalidRequest();
    logger.error("Confirmed subscriber deletion failed", { error });
    return unavailable();
  }
}
