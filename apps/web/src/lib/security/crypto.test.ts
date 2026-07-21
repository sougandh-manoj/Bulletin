import { describe, expect, it } from "vitest";

import {
  buildManagementUrl,
  createOpaqueToken,
  hashValue,
  parseSessionCookie,
  signManagementClaims,
  toPostgresBytea,
  verifyManagementClaims,
} from "@/lib/security/crypto";

const secret = "management-test-secret-with-at-least-32-characters";
const claims = {
  publicReference: "0d196f88-54e6-4ab0-badf-6f33709ba8d2",
  tokenVersion: 3,
  expiresAt: 2_000_000_000,
};

describe("secure access cryptography", () => {
  it("creates 256-bit base64url bearer values", () => {
    const token = createOpaqueToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(createOpaqueToken()).not.toBe(token);
  });

  it("stores only a PostgreSQL bytea SHA-256 hash", () => {
    const encoded = toPostgresBytea(hashValue("raw-private-token"));
    expect(encoded).toMatch(/^\\x[0-9a-f]{64}$/);
    expect(encoded).not.toContain("raw-private-token");
  });

  it("accepts an unexpired authentic management signature", () => {
    const signature = signManagementClaims(claims, secret);
    expect(
      verifyManagementClaims({ ...claims, signature }, secret, 1_900_000_000),
    ).toBe(true);
  });

  it("fails closed for tampering, wrong secrets, and token-version changes", () => {
    const signature = signManagementClaims(claims, secret);
    expect(verifyManagementClaims({ ...claims, signature: `x${signature.slice(1)}` }, secret, 1_900_000_000)).toBe(false);
    expect(verifyManagementClaims({ ...claims, signature }, `${secret}-wrong`, 1_900_000_000)).toBe(false);
    expect(verifyManagementClaims({ ...claims, tokenVersion: 4, signature }, secret, 1_900_000_000)).toBe(false);
  });

  it("rejects expired and malformed signed-link state", () => {
    const signature = signManagementClaims(claims, secret);
    expect(verifyManagementClaims({ ...claims, signature }, secret, claims.expiresAt)).toBe(false);
    expect(verifyManagementClaims({ ...claims, publicReference: "not-a-uuid", signature }, secret, 1_900_000_000)).toBe(false);
  });

  it("builds only public claims and a signature into a link", () => {
    const url = new URL(buildManagementUrl("https://bulletin.example", claims, secret));
    expect(url.pathname).toBe("/access/manage");
    expect(url.searchParams.get("r")).toBe(claims.publicReference);
    expect(url.searchParams.get("v")).toBe("3");
    expect(url.searchParams.get("e")).toBe(String(claims.expiresAt));
    expect(url.toString()).not.toContain(secret);
  });

  it("parses only the exact two-part session-cookie shape", () => {
    const first = "a".repeat(43);
    const second = "b".repeat(43);
    expect(parseSessionCookie(`${first}.${second}`)).toEqual({
      sessionToken: first,
      csrfToken: second,
    });
    expect(parseSessionCookie(`${first}.${second}.extra`)).toBeNull();
    expect(parseSessionCookie("short.parts")).toBeNull();
  });
});
