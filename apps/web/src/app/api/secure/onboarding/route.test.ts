import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAuthenticatedSubscriber: vi.fn(),
  getAuthenticatedAuthUser: vi.fn(),
}));

vi.mock("@/data/subscribers", () => ({
  createAuthenticatedSubscriber: mocks.createAuthenticatedSubscriber,
}));
vi.mock("@/lib/security/authenticated-subscriber", () => ({
  getAuthenticatedAuthUser: mocks.getAuthenticatedAuthUser,
}));

import { POST } from "@/app/api/secure/onboarding/route";

const payload = {
  name: "Reader",
  email: "reader@example.com",
  countryCode: "IN",
  stateRegion: "Kerala",
  city: "Kochi",
  language: "en",
  categories: ["india", "technology-ai"],
  customTopics: ["space policy"],
  excludedTopics: ["celebrity gossip"],
  storyCount: 8,
  theme: "amber-brief",
  frequency: "daily",
  deliveryTime: "08:00",
  timezone: "Asia/Kolkata",
  consent: true,
};

function request(body: unknown = payload) {
  return new Request("https://bulletin.example/api/secure/onboarding", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("atomic onboarding submission boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthenticatedAuthUser.mockResolvedValue({
      user: { id: "auth-user-1" },
      email: "reader@example.com",
    });
  });

  it("creates an active subscriber for the signed-in account after full validation", async () => {
    mocks.createAuthenticatedSubscriber.mockResolvedValue({
      subscriber_id: "subscriber-1",
      outcome: "created",
      next_delivery_at: "2026-07-31T02:30:00Z",
    });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      state: "created",
      nextDeliveryAt: "2026-07-31T02:30:00Z",
    });
    expect(mocks.createAuthenticatedSubscriber).toHaveBeenCalledWith({
      authUserId: "auth-user-1",
      preferences: expect.objectContaining({ theme: "amber-brief" }),
    });
  });

  it("returns existing without creating a duplicate", async () => {
    mocks.createAuthenticatedSubscriber.mockResolvedValue({
      subscriber_id: "subscriber-1",
      outcome: "existing",
      next_delivery_at: "2026-07-31T02:30:00Z",
    });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      state: "existing",
      nextDeliveryAt: "2026-07-31T02:30:00Z",
    });
  });

  it("rejects mismatched account email", async () => {
    mocks.getAuthenticatedAuthUser.mockResolvedValue({
      user: { id: "auth-user-1" },
      email: "other@example.com",
    });
    const response = await POST(request());
    expect(response.status).toBe(403);
    expect(mocks.createAuthenticatedSubscriber).not.toHaveBeenCalled();
  });

  it("requires sign-in before any subscriber operation", async () => {
    mocks.getAuthenticatedAuthUser.mockResolvedValue(null);
    const response = await POST(request());
    expect(response.status).toBe(401);
    expect(mocks.createAuthenticatedSubscriber).not.toHaveBeenCalled();
  });

  it("rejects incomplete payloads before any subscriber operation", async () => {
    const response = await POST(request({ email: "reader@example.com" }));
    expect(response.status).toBe(400);
    expect(mocks.createAuthenticatedSubscriber).not.toHaveBeenCalled();
  });
});
