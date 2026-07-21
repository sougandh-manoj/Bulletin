import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  token: "t".repeat(43),
  intent: "i".repeat(43),
  consumeVerificationToken: vi.fn(),
  findSubscriberForManagement: vi.fn(),
  enforceRateLimit: vi.fn(),
  clearSubscriberSessionCookie: vi.fn(),
  establishSubscriberSession: vi.fn(),
  cookieSet: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => ({ value: `${mocks.token}.${mocks.intent}` }),
    set: mocks.cookieSet,
  }),
}));
vi.mock("@/data/subscribers", () => ({
  consumeVerificationToken: mocks.consumeVerificationToken,
  findSubscriberForManagement: mocks.findSubscriberForManagement,
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

describe("theme-led verification confirmation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enforceRateLimit.mockResolvedValue(true);
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

  it("activates delivery with the selected theme in one deliberate request", async () => {
    const response = await POST(request({ intent: mocks.intent, theme: "amber-brief" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, theme: "amber-brief" });
    expect(mocks.consumeVerificationToken).toHaveBeenCalledWith(
      expect.any(String),
      "amber-brief",
    );
    expect(mocks.establishSubscriberSession).toHaveBeenCalledWith({
      subscriberId: "subscriber-1",
      tokenVersion: 1,
    });
  });

  it("rejects a missing or unknown theme before consuming the verification token", async () => {
    const response = await POST(request({ intent: mocks.intent, theme: "unknown-theme" }));

    expect(response.status).toBe(400);
    expect(mocks.consumeVerificationToken).not.toHaveBeenCalled();
  });
});
