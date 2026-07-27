import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createPendingSubscriber: vi.fn(),
  findSubscriberForManagement: vi.fn(),
  enforceRateLimit: vi.fn(),
  issueManagementEmail: vi.fn(),
  issueVerificationEmailForSubscriber: vi.fn(),
}));

vi.mock("@/data/subscribers", () => ({
  createPendingSubscriber: mocks.createPendingSubscriber,
  findSubscriberForManagement: mocks.findSubscriberForManagement,
}));
vi.mock("@/lib/security/rate-limit", () => ({ enforceRateLimit: mocks.enforceRateLimit }));
vi.mock("@/services/access", () => ({
  issueManagementEmail: mocks.issueManagementEmail,
  issueVerificationEmailForSubscriber: mocks.issueVerificationEmailForSubscriber,
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
    mocks.enforceRateLimit.mockResolvedValue(true);
    mocks.issueManagementEmail.mockResolvedValue(undefined);
    mocks.issueVerificationEmailForSubscriber.mockResolvedValue(undefined);
  });

  it("creates a pending subscriber and sends verification only after full validation", async () => {
    mocks.createPendingSubscriber.mockResolvedValue({ subscriber_id: "subscriber-1", outcome: "created" });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, state: "pending", emailSent: true });
    expect(mocks.createPendingSubscriber).toHaveBeenCalledTimes(1);
    expect(mocks.createPendingSubscriber).toHaveBeenCalledWith(expect.objectContaining({ theme: "amber-brief" }));
    expect(mocks.issueVerificationEmailForSubscriber).toHaveBeenCalledWith({ subscriberId: "subscriber-1", email: "reader@example.com" });
  });

  it("preserves an existing pending account and reissues verification", async () => {
    mocks.createPendingSubscriber.mockResolvedValue({ subscriber_id: "subscriber-1", outcome: "existing-pending" });
    const response = await POST(request({ ...payload, name: "Overwrite attempt" }));
    expect(response.status).toBe(200);
    expect(mocks.issueVerificationEmailForSubscriber).toHaveBeenCalledWith({ subscriberId: "subscriber-1", email: "reader@example.com" });
    expect(mocks.issueManagementEmail).not.toHaveBeenCalled();
  });

  it("stops duplicate verified onboarding and sends management access instead", async () => {
    mocks.createPendingSubscriber.mockResolvedValue({ subscriber_id: "subscriber-1", outcome: "existing-verified" });
    mocks.findSubscriberForManagement.mockResolvedValue({ public_reference: "public-ref", token_version: 7 });
    const response = await POST(request());
    expect(await response.json()).toEqual({ ok: true, state: "verified", emailSent: true });
    expect(mocks.issueManagementEmail).toHaveBeenCalledWith({ email: "reader@example.com", publicReference: "public-ref", tokenVersion: 7 });
    expect(mocks.issueVerificationEmailForSubscriber).not.toHaveBeenCalled();
  });

  it("keeps the retryable UI state and never claims delivery after an SMTP failure", async () => {
    mocks.createPendingSubscriber.mockResolvedValue({ subscriber_id: "subscriber-1", outcome: "created" });
    mocks.issueVerificationEmailForSubscriber.mockRejectedValue(new Error("safe fake failure"));
    const response = await POST(request());
    expect(response.status).toBe(503);
    const result = await response.json() as { emailSent?: boolean };
    expect(result.emailSent).not.toBe(true);
  });

  it("rejects incomplete payloads before any subscriber operation", async () => {
    const response = await POST(request({ email: "reader@example.com" }));
    expect(response.status).toBe(400);
    expect(mocks.createPendingSubscriber).not.toHaveBeenCalled();
  });
});
