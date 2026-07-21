import "server-only";

import { consumeRateLimit } from "@/data/subscribers";
import { getSecureAccessEnvironment } from "@/env/server";
import { getRequestSubject } from "@/lib/security/request";

type RateLimitScope =
  | "email-check"
  | "verification-request"
  | "management-request"
  | "token-validation";

export async function enforceRateLimit(input: {
  request: Request;
  scope: RateLimitScope;
  discriminator: string;
  limit: number;
  windowSeconds: number;
}) {
  const now = Date.now();
  const windowMilliseconds = input.windowSeconds * 1000;
  const windowStartedAt = new Date(
    Math.floor(now / windowMilliseconds) * windowMilliseconds,
  );
  const expiresAt = new Date(windowStartedAt.getTime() + windowMilliseconds);

  return consumeRateLimit({
    scope: input.scope,
    subjectHash: getRequestSubject(
      input.request,
      input.discriminator,
      getSecureAccessEnvironment().SESSION_SIGNING_SECRET,
    ),
    windowStartedAt: windowStartedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    limit: input.limit,
  });
}
