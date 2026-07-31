import { describe, expect, it } from "vitest";

import {
  createOpaqueToken,
  hashValue,
  parseSessionCookie,
  toPostgresBytea,
} from "@/lib/security/crypto";

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
