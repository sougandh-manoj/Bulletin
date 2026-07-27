import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  inspectVerificationToken: vi.fn(),
  enforceRateLimit: vi.fn(),
}));

vi.mock("@/data/subscribers", () => ({
  inspectVerificationToken: mocks.inspectVerificationToken,
}));
vi.mock("@/lib/security/rate-limit", () => ({
  enforceRateLimit: mocks.enforceRateLimit,
}));

import { GET } from "@/app/access/verify/route";

const token = "a".repeat(43);

describe("scanner-safe verification GET", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enforceRateLimit.mockResolvedValue(true);
    mocks.inspectVerificationToken.mockResolvedValue({ is_valid: true });
  });

  it("only inspects, sets a protected intent cookie, and redirects with a browser fallback", async () => {
    const response = await GET(new Request(`https://bulletin.example/access/verify?t=${token}`));
    expect(response.status).toBe(303);
    const location = response.headers.get("location") ?? "";
    expect(location).toContain("https://bulletin.example/verify?");
    expect(location).toContain(`t=${token}`);
    expect(location).toMatch(/i=[A-Za-z0-9_-]{43}/);
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("__Host-bulletin_verify=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=lax");
    expect(mocks.inspectVerificationToken).toHaveBeenCalledTimes(1);
  });

  it("does not set an intent cookie for an expired, consumed, or superseded token", async () => {
    mocks.inspectVerificationToken.mockResolvedValue({ is_valid: false });
    const response = await GET(new Request(`https://bulletin.example/access/verify?t=${token}`));
    expect(response.headers.get("location")).toBe("https://bulletin.example/verify?state=invalid");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("fails closed for malformed tokens before database inspection", async () => {
    const response = await GET(new Request("https://bulletin.example/access/verify?t=short"));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("state=invalid");
    expect(mocks.inspectVerificationToken).not.toHaveBeenCalled();
  });

  it("rate limits token validation", async () => {
    mocks.enforceRateLimit.mockResolvedValue(false);
    const response = await GET(new Request(`https://bulletin.example/access/verify?t=${token}`));
    expect(response.headers.get("location")).toContain("state=limited");
    expect(mocks.inspectVerificationToken).not.toHaveBeenCalled();
  });
});
