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

export type SignedManagementLinkClaims = ManagementLinkClaims & {
  signature: string;
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
  input: SignedManagementLinkClaims,
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

export function encodeManagementTicket(claims: SignedManagementLinkClaims) {
  return Buffer.from(JSON.stringify({
    r: claims.publicReference,
    v: claims.tokenVersion,
    e: claims.expiresAt,
    s: claims.signature,
  }), "utf8").toString("base64url");
}

export function decodeManagementTicket(ticket: string) {
  if (!/^[A-Za-z0-9_-]{40,512}$/.test(ticket)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(ticket, "base64url").toString("utf8")) as unknown;
    const result = z.object({
      r: publicReferenceSchema,
      v: tokenVersionSchema,
      e: unixSecondsSchema,
      s: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    }).safeParse(parsed);
    if (!result.success) return null;
    return {
      publicReference: result.data.r,
      tokenVersion: result.data.v,
      expiresAt: result.data.e,
      signature: result.data.s,
    };
  } catch {
    return null;
  }
}

export function buildManagementUrl(
  baseUrl: string,
  claims: ManagementLinkClaims,
  secret: string,
) {
  const url = new URL("/access/manage/", baseUrl);
  const signature = signManagementClaims(claims, secret);
  url.pathname += encodeManagementTicket({ ...claims, signature });
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
