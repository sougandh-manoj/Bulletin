import {
  createHash,
  createHmac,
  randomBytes,
} from "node:crypto";

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

export function parseSessionCookie(value: string | undefined) {
  if (!value) return null;
  const [sessionToken, csrfToken, extra] = value.split(".");
  if (extra || !sessionToken || !csrfToken) return null;
  if (!/^[A-Za-z0-9_-]{43}$/.test(sessionToken)) return null;
  if (!/^[A-Za-z0-9_-]{43}$/.test(csrfToken)) return null;
  return { sessionToken, csrfToken };
}
