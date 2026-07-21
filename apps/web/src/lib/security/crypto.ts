import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import { z } from "zod";

const publicReferenceSchema = z.string().uuid();
const tokenVersionSchema = z.number().int().min(1);
const unixSecondsSchema = z.number().int().positive();

export type ManagementLinkClaims = {
  publicReference: string;
  tokenVersion: number;
  expiresAt: number;
};

export function createOpaqueToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function hashValue(value: string) {
  return createHash("sha256").update(value, "utf8").digest();
}

export function hmacHashValue(value: string, secret: string) {
  return createHmac("sha256", secret).update(value, "utf8").digest();
}

export function toPostgresBytea(value: Buffer) {
  return `\\x${value.toString("hex")}`;
}

function managementPayload(claims: ManagementLinkClaims) {
  return `${claims.publicReference}.${claims.tokenVersion}.${claims.expiresAt}`;
}

export function signManagementClaims(
  claims: ManagementLinkClaims,
  secret: string,
) {
  return createHmac("sha256", secret)
    .update(managementPayload(claims), "utf8")
    .digest("base64url");
}

export function verifyManagementClaims(
  input: ManagementLinkClaims & { signature: string },
  secret: string,
  now = Math.floor(Date.now() / 1000),
) {
  const parsed = z.object({
    publicReference: publicReferenceSchema,
    tokenVersion: tokenVersionSchema,
    expiresAt: unixSecondsSchema,
    signature: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  }).safeParse(input);

  if (!parsed.success || parsed.data.expiresAt <= now) return false;

  const expected = Buffer.from(
    signManagementClaims(parsed.data, secret),
    "utf8",
  );
  const supplied = Buffer.from(parsed.data.signature, "utf8");
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

export function buildManagementUrl(
  baseUrl: string,
  claims: ManagementLinkClaims,
  secret: string,
) {
  const url = new URL("/access/manage", baseUrl);
  url.searchParams.set("r", claims.publicReference);
  url.searchParams.set("v", String(claims.tokenVersion));
  url.searchParams.set("e", String(claims.expiresAt));
  url.searchParams.set("s", signManagementClaims(claims, secret));
  return url.toString();
}

export function parseSessionCookie(value: string | undefined) {
  if (!value) return null;
  const [sessionToken, csrfToken, extra] = value.split(".");
  if (extra || !sessionToken || !csrfToken) return null;
  if (!/^[A-Za-z0-9_-]{43}$/.test(sessionToken)) return null;
  if (!/^[A-Za-z0-9_-]{43}$/.test(csrfToken)) return null;
  return { sessionToken, csrfToken };
}
