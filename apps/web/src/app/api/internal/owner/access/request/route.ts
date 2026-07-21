import { z } from "zod";

import { consumeRateLimit } from "@/data/subscribers";
import { getOwnerEnvironment } from "@/env/server";
import { createLogger } from "@/lib/logging/logger";
import { privateJson } from "@/lib/security/api";
import { getRequestSubject, hasValidSameOrigin, readJsonBody } from "@/lib/security/request";
import { issueOwnerAccessEmail } from "@/services/owner-access";

export const runtime = "nodejs";

const logger = createLogger("owner-access-request");
const schema = z.object({ email: z.string().trim().email().max(254) }).strict();

export async function POST(request: Request) {
  try {
    const environment = getOwnerEnvironment();
    if (!hasValidSameOrigin(request, environment.APP_BASE_URL)) {
      return privateJson({ ok: false, message: "Request denied" }, { status: 403 });
    }
    const parsed = schema.safeParse(await readJsonBody(request, 2_000));
    if (!parsed.success) return privateJson({ ok: false, message: "Check the email address" }, { status: 400 });
    const now = new Date();
    const windowStarted = new Date(Math.floor(now.getTime() / 900_000) * 900_000);
    const allowed = await consumeRateLimit({
      scope: "admin-access",
      subjectHash: getRequestSubject(request, "owner-access", environment.SESSION_SIGNING_SECRET),
      windowStartedAt: windowStarted.toISOString(),
      expiresAt: new Date(windowStarted.getTime() + 15 * 60_000).toISOString(),
      limit: 5,
    });
    if (allowed) await issueOwnerAccessEmail(parsed.data.email);
    return privateJson({ ok: true, message: "If authorized, a one-time link has been sent" });
  } catch (error) {
    logger.error("Owner access request failed", { errorType: error instanceof Error ? error.name : "unknown" });
    return privateJson({ ok: false, message: "Access is temporarily unavailable" }, { status: 503 });
  }
}
