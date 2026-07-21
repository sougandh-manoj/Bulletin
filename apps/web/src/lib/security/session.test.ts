import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookieGet: vi.fn(),
  cookieSet: vi.fn(),
  createSubscriberSession: vi.fn(),
  validateSubscriberSession: vi.fn(),
  loadSubscriberManagementDTO: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: mocks.cookieGet, set: mocks.cookieSet }),
}));
vi.mock("@/data/subscribers", () => ({
  createSubscriberSession: mocks.createSubscriberSession,
  validateSubscriberSession: mocks.validateSubscriberSession,
  loadSubscriberManagementDTO: mocks.loadSubscriberManagementDTO,
}));

import {
  establishSubscriberSession,
  getAuthenticatedSubscriber,
} from "@/lib/security/session";

describe("subscriber session cookie boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
    mocks.createSubscriberSession.mockResolvedValue({ session_id: "session-1" });
  });

  it("stores only hashes and sets a 30-minute Secure HttpOnly SameSite cookie", async () => {
    await establishSubscriberSession({ subscriberId: "subscriber-1", tokenVersion: 4 });
    const databaseInput = mocks.createSubscriberSession.mock.calls[0][0] as {
      sessionHash: string;
      csrfHash: string;
      expiresAt: string;
    };
    expect(databaseInput.sessionHash).toMatch(/^\\x[0-9a-f]{64}$/);
    expect(databaseInput.csrfHash).toMatch(/^\\x[0-9a-f]{64}$/);
    expect(new Date(databaseInput.expiresAt).getTime()).toBe(1_800_001_800_000);

    const [name, value, options] = mocks.cookieSet.mock.calls[0];
    expect(name).toBe("__Host-bulletin_session");
    expect(value).toMatch(/^[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/);
    expect(options).toMatchObject({ httpOnly: true, secure: true, sameSite: "strict", path: "/", priority: "high" });
  });

  it("fails closed for malformed or missing session cookies", async () => {
    mocks.cookieGet.mockReturnValue({ value: "malformed" });
    await expect(getAuthenticatedSubscriber()).resolves.toBeNull();
    expect(mocks.validateSubscriberSession).not.toHaveBeenCalled();
  });

  it("requires the exact CSRF token before authorizing a mutation", async () => {
    const sessionToken = "a".repeat(43);
    const csrfToken = "b".repeat(43);
    mocks.cookieGet.mockReturnValue({ value: `${sessionToken}.${csrfToken}` });
    await expect(getAuthenticatedSubscriber({ csrfToken: "c".repeat(43) })).resolves.toBeNull();
    expect(mocks.validateSubscriberSession).not.toHaveBeenCalled();
  });
});
