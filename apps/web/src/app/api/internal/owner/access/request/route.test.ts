import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rateLimit: vi.fn(),
  issue: vi.fn(),
}));

vi.mock("@/data/subscribers", () => ({ consumeRateLimit: mocks.rateLimit }));
vi.mock("@/env/server", () => ({
  getOwnerEnvironment: () => ({
    APP_BASE_URL: "https://bulletin.example",
    SESSION_SIGNING_SECRET: "owner-test-session-secret-at-least-thirty-two-characters",
  }),
  getServerEnvironment: () => ({ LOG_LEVEL: "error" }),
}));
vi.mock("@/services/owner-access", () => ({ issueOwnerAccessEmail: mocks.issue }));

import { POST } from "./route";

function request(email: string, origin = "https://bulletin.example") {
  return new Request("https://bulletin.example/api/internal/owner/access/request", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
}

describe("owner access request privacy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimit.mockResolvedValue(true);
  });

  it("returns the same response regardless of the allowlist result", async () => {
    mocks.issue.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    const denied = await POST(request("not-owner@example.com"));
    expect(await denied.json()).toEqual({ ok: true, message: "If authorized, a one-time link has been sent" });

    const owner = await POST(request("owner@example.com"));
    expect(await owner.json()).toEqual({ ok: true, message: "If authorized, a one-time link has been sent" });
    expect(mocks.issue).toHaveBeenCalledTimes(2);
  });

  it("preserves same-origin and rate-limit boundaries", async () => {
    expect((await POST(request("owner@example.com", "https://attacker.example"))).status).toBe(403);
    mocks.rateLimit.mockResolvedValue(false);
    const limited = await POST(request("owner@example.com"));
    expect(limited.status).toBe(200);
    expect(await limited.json()).toEqual({ ok: true, message: "If authorized, a one-time link has been sent" });
    expect(mocks.issue).not.toHaveBeenCalled();
  });
});
