import "server-only";

import { cookies } from "next/headers";

import {
  consumeAdminAccessToken,
  validateAdminSession,
} from "@/data/operations";
import {
  createOpaqueToken,
  hashValue,
  parseSessionCookie,
  toPostgresBytea,
} from "@/lib/security/crypto";
import {
  ADMIN_SESSION_COOKIE_NAME,
  ADMIN_SESSION_TTL_SECONDS,
} from "@/lib/security/constants";

export async function establishAdminSession(rawAccessToken: string) {
  const sessionToken = createOpaqueToken();
  const csrfToken = createOpaqueToken();
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_TTL_SECONDS * 1000);
  const consumed = await consumeAdminAccessToken({
    tokenHash: toPostgresBytea(hashValue(rawAccessToken)),
    sessionHash: toPostgresBytea(hashValue(sessionToken)),
    csrfHash: toPostgresBytea(hashValue(csrfToken)),
    expiresAt: expiresAt.toISOString(),
  });
  if (!consumed) return false;
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE_NAME, `${sessionToken}.${csrfToken}`, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    expires: expiresAt,
    priority: "high",
  });
  return true;
}

export async function getAuthenticatedOwner(options?: { csrfToken?: string }) {
  const cookieStore = await cookies();
  const parsed = parseSessionCookie(cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value);
  if (!parsed) return null;
  if (options?.csrfToken && parsed.csrfToken !== options.csrfToken) return null;
  const session = await validateAdminSession({
    sessionHash: toPostgresBytea(hashValue(parsed.sessionToken)),
    ...(options?.csrfToken ? { csrfHash: toPostgresBytea(hashValue(options.csrfToken)) } : {}),
  });
  if (!session) return null;
  return { session, csrfToken: parsed.csrfToken };
}
