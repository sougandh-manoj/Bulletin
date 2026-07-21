import "server-only";

import { timingSafeEqual } from "node:crypto";

import { issueAdminAccessToken } from "@/data/operations";
import { getOwnerEnvironment } from "@/env/server";
import { sendOwnerAccessEmail } from "@/lib/email/mailer";
import {
  createOpaqueToken,
  hashValue,
  hmacHashValue,
  toPostgresBytea,
} from "@/lib/security/crypto";
import { ADMIN_ACCESS_TTL_SECONDS } from "@/lib/security/constants";

export async function issueOwnerAccessEmail(suppliedEmail: string) {
  const environment = getOwnerEnvironment();
  const normalized = suppliedEmail.trim().toLowerCase();
  const expected = environment.OWNER_EMAIL.trim().toLowerCase();
  if (!timingSafeEqual(hashValue(normalized), hashValue(expected))) return false;
  const token = createOpaqueToken();
  const expiresAt = new Date(Date.now() + ADMIN_ACCESS_TTL_SECONDS * 1000);
  await issueAdminAccessToken({
    ownerEmailHash: toPostgresBytea(hmacHashValue(expected, environment.SESSION_SIGNING_SECRET)),
    tokenHash: toPostgresBytea(hashValue(token)),
    expiresAt: expiresAt.toISOString(),
  });
  const url = new URL("/internal/access/exchange", environment.APP_BASE_URL);
  url.searchParams.set("t", token);
  await sendOwnerAccessEmail(environment.OWNER_EMAIL, url.toString());
  return true;
}
