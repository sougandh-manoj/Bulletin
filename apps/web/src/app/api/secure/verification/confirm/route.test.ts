import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  token: "t".repeat(43),
  intent: "i".repeat(43),
  inspectVerificationToken: vi.fn(),
  loadSubscriberThemeForVerification: vi.fn(),
  consumeVerificationToken: vi.fn(),
  findSubscriberForManagement: vi.fn(),
  enforceRateLimit: vi.fn(),
  clearSubscriberSessionCookie: vi.fn(),
  establishSubscriberSession: vi.fn(),
  cookieGet: vi.fn(),
  cookieSet: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: mocks.cookieGet,
    set: mocks.cookieSet,
  }),
}));
vi.mock("@/data/subscribers", () => ({
  consumeVerificationToken: mocks.consumeVerificationToken,
  findSubscriberForManagement: mocks.findSubscriberForManagement,
  inspectVerificationToken: mocks.inspectVerificationToken,
  loadSubscriberThemeForVerification: mocks.loadSubscriberThemeForVerification,
}));
vi.mock("@/env/server", () => ({
  getSecureAccessEnvironment: () => ({ APP_BASE_URL: "https://bulletin.example", LOG_LEVEL: "error" }),
  getServerEnvironment: () => ({ LOG_LEVEL: "error" }),
}));
vi.mock("@/lib/security/rate-limit", () => ({ enforceRateLimit: mocks.enforceRateLimit }));
vi.mock("@/lib/security/session", () => ({
  clearSubscriberSessionCookie: mocks.clearSubscriberSessionCookie,
  establishSubscriberSession: mocks.establishSubscriberSession,
}));

import { POST } from "@/app/api/secure/verification/confirm/route";

function request(body: unknown) {
  return new Request("https://bulletin.example/api/secure/verification/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json", origin: "https://bulletin.example" },
    body: JSON.stringify(body),
  });
}

describe("verification confirmation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookieGet.mockReturnValue({ value: `${mocks.token}.${mocks.intent}` });
    mocks.enforceRateLimit.mockResolvedValue(true);
    mocks.inspectVerificationToken.mockResolvedValue({
      is_valid: true,
      subscriber_public_reference: "public-reference",
      expires_at: "2026-07-16T02:30:00Z",
    });
    mocks.loadSubscriberThemeForVerification.mockResolvedValue("amber-brief");
    mocks.consumeVerificationToken.mockResolvedValue({
      subscriber_public_reference: "public-reference",
      next_delivery_at: "2026-07-16T02:30:00Z",
    });
    mocks.findSubscriberForManagement.mockResolvedValue({
      id: "subscriber-1",
      status: "active",
      token_version: 1,
    });
  });

  it("activates delivery with the onboarding-selected theme in one deliberate request", async () => {
    const response = await POST(request({ intent: mocks.intent }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, theme: "amber-brief" });
    expect(mocks.loadSubscriberThemeForVerification).toHaveBeenCalledWith("public-reference");
    expect(mocks.consumeVerificationToken).toHaveBeenCalledWith(
      expect.any(String),
      "amber-brief",
    );
    expect(mocks.establishSubscriberSession).toHaveBeenCalledWith({
      subscriberId: "subscriber-1",
      tokenVersion: 1,
    });
  });

  it("rejects a missing stored theme before consuming the verification token", async () => {
    mocks.loadSubscriberThemeForVerification.mockResolvedValue(null);
    const response = await POST(request({ intent: mocks.intent }));

    expect(response.status).toBe(503);
    expect(mocks.consumeVerificationToken).not.toHaveBeenCalled();
  });

  it("can confirm with the URL fallback token when the redirect cookie is unavailable", async () => {
    mocks.cookieGet.mockReturnValueOnce(undefined);
    const response = await POST(request({ intent: mocks.intent, token: mocks.token }));

    expect(response.status).toBe(200);
    expect(mocks.consumeVerificationToken).toHaveBeenCalledWith(
      expect.any(String),
      "amber-brief",
    );
  });
});
