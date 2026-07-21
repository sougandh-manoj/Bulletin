import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resendForEmail: vi.fn(),
  enforceRateLimit: vi.fn(),
}));

vi.mock("@/services/access", () => ({ resendForEmail: mocks.resendForEmail }));
vi.mock("@/lib/security/rate-limit", () => ({ enforceRateLimit: mocks.enforceRateLimit }));

import { POST } from "@/app/api/secure/email/check/route";

function request(email = "reader@example.com") {
  return new Request("https://bulletin.example/api/secure/email/check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
}

describe("real early-email checking boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enforceRateLimit.mockResolvedValue(true);
  });

  it.each(["new", "expired"])("lets a %s address continue without claiming email delivery", async (state) => {
    mocks.resendForEmail.mockResolvedValue({ state });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, state });
  });

  it.each(["verified", "pending"])("reports a sent secure email for a %s account", async (state) => {
    mocks.resendForEmail.mockResolvedValue({ state });
    const response = await POST(request());
    expect(await response.json()).toEqual({ ok: true, state, emailSent: true });
  });

  it("does not claim an email was sent when delivery fails", async () => {
    mocks.resendForEmail.mockRejectedValue(new Error("smtp unavailable"));
    const response = await POST(request());
    expect(response.status).toBe(503);
    const result = await response.json() as { emailSent?: boolean };
    expect(result.emailSent).not.toBe(true);
  });

  it("rejects invalid input and rate limits repeated requests", async () => {
    const invalid = await POST(request("not-an-email"));
    expect(invalid.status).toBe(400);
    mocks.enforceRateLimit.mockResolvedValue(false);
    const limited = await POST(request());
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("900");
  });
});
