import "server-only";

import { cookies } from "next/headers";

import {
  createSubscriberSession,
  loadSubscriberManagementDTO,
  validateSubscriberSession,
} from "@/data/subscribers";
import {
  createOpaqueToken,
  hashValue,
  parseSessionCookie,
  toPostgresBytea,
} from "@/lib/security/crypto";
import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
} from "@/lib/security/constants";

export async function establishSubscriberSession(input: {
  subscriberId: string;
  tokenVersion: number;
}) {
  const sessionToken = createOpaqueToken();
  const csrfToken = createOpaqueToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);

  await createSubscriberSession({
    subscriberId: input.subscriberId,
    tokenVersion: input.tokenVersion,
    sessionHash: toPostgresBytea(hashValue(sessionToken)),
    csrfHash: toPostgresBytea(hashValue(csrfToken)),
    expiresAt: expiresAt.toISOString(),
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, `${sessionToken}.${csrfToken}`, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    expires: expiresAt,
    priority: "high",
  });
  return { csrfToken, expiresAt };
}

export async function getAuthenticatedSubscriber(options?: {
  csrfToken?: string;
}) {
  const cookieStore = await cookies();
  const parsed = parseSessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!parsed) return null;

  if (options?.csrfToken && parsed.csrfToken !== options.csrfToken) return null;

  const session = await validateSubscriberSession(
    toPostgresBytea(hashValue(parsed.sessionToken)),
    options?.csrfToken
      ? toPostgresBytea(hashValue(options.csrfToken))
      : undefined,
  );
  if (!session) return null;

  const subscriber = await loadSubscriberManagementDTO(session.subscriber_id);
  if (!subscriber) return null;
  return { session, subscriber, csrfToken: parsed.csrfToken };
}

export async function clearSubscriberSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    expires: new Date(0),
  });
}
