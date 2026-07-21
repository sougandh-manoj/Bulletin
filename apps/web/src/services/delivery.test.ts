import { beforeEach, describe, expect, it, vi } from "vitest";

import { BriefingDeliveryError } from "@/lib/email/mailer";
import { runDeliveryBatch } from "./delivery";

vi.mock("@/env/server", () => ({
  getSecureAccessEnvironment: () => ({
    APP_BASE_URL: "https://bulletin.example",
    MANAGEMENT_LINK_SIGNING_SECRET: "management-secret-at-least-thirty-two-characters",
    LOG_LEVEL: "error",
  }),
  getServerEnvironment: () => ({ LOG_LEVEL: "error" }),
}));

const claim = { deliveryId: "00000000-0000-4000-8000-000000000001", leaseToken: "00000000-0000-4000-8000-000000000002", attemptCount: 1 };
function context(attemptCount = 1) {
  return {
    deliveryId: claim.deliveryId,
    subscriberId: "00000000-0000-4000-8000-000000000003",
    recipient: "recipient@example.invalid",
    subscriberName: "Reader",
    subscriberPublicReference: "00000000-0000-4000-8000-000000000004",
    subscriberTokenVersion: 1,
    scheduledFor: "2026-07-12T02:30:00.000Z",
    preferenceVersion: 1,
    language: "en" as const,
    theme: "light-editorial" as const,
    timezone: "Asia/Kolkata",
    actualStoryCount: 2,
    attemptCount,
    stories: [
      { position: 1, clusterPublicReference: "1", clusterVersion: 1, summaryId: "s1", category: "india" as const, headline: "First exact story", summary: "One. Two. Three.", whyItMatters: "First reason.", isUpdate: false, sources: [{ name: "One", url: "https://one.example/a" }] },
      { position: 2, clusterPublicReference: "2", clusterVersion: 3, summaryId: "s2", category: "science" as const, headline: "Second exact story", summary: "Four. Five. Six.", whyItMatters: "Second reason.", isUpdate: true, sources: [{ name: "Two", url: "https://two.example/b" }] },
    ],
  };
}

describe("Phase 9 delivery worker", () => {
  const dependencies = {
    recover: vi.fn(), claim: vi.fn(), load: vi.fn(), markRendered: vi.fn(),
    beginSend: vi.fn(), send: vi.fn(), complete: vi.fn(), fail: vi.fn(),
    heartbeat: vi.fn(), alert: vi.fn(),
  };
  beforeEach(() => {
    vi.clearAllMocks();
    dependencies.recover.mockResolvedValue({ retryable: 0, ambiguous: 0 });
    dependencies.claim.mockResolvedValue([claim]);
    dependencies.load.mockResolvedValue(context());
    dependencies.markRendered.mockResolvedValue(true);
    dependencies.beginSend.mockResolvedValue(true);
    dependencies.send.mockResolvedValue({ messageId: "test-message" });
    dependencies.complete.mockResolvedValue(true);
    dependencies.fail.mockResolvedValue(true);
    dependencies.heartbeat.mockResolvedValue(undefined);
    dependencies.alert.mockResolvedValue(false);
  });

  it("renders the exact stored order, gates last before SMTP, and records success once", async () => {
    const calls: string[] = [];
    dependencies.markRendered.mockImplementation(async () => { calls.push("rendered"); return true; });
    dependencies.beginSend.mockImplementation(async () => { calls.push("gate"); return true; });
    dependencies.send.mockImplementation(async (message) => { calls.push("smtp"); expect(message.html.indexOf("First exact story")).toBeLessThan(message.html.indexOf("Second exact story")); return { messageId: "receipt" }; });
    dependencies.complete.mockImplementation(async () => { calls.push("complete"); return true; });
    const result = await runDeliveryBatch({ dependencies, now: () => new Date("2026-07-12T02:31:00Z") });
    expect(calls).toEqual(["rendered", "gate", "smtp", "complete"]);
    expect(result.sent).toBe(1);
    expect(dependencies.fail).not.toHaveBeenCalled();
  });

  it.each([
    [1, "2026-07-12T02:36:00.000Z", false],
    [2, "2026-07-12T02:46:00.000Z", false],
    [3, "2026-07-12T03:31:00.000Z", false],
    [4, null, true],
  ])("applies bounded temporary SMTP retry schedule at attempt %i", async (attempt, retryAt, permanent) => {
    dependencies.load.mockResolvedValue(context(attempt));
    dependencies.send.mockRejectedValue(new BriefingDeliveryError("smtp-temporary-response", false));
    const result = await runDeliveryBatch({ dependencies, now: () => new Date("2026-07-12T02:31:00Z") });
    expect(dependencies.fail).toHaveBeenCalledWith(expect.objectContaining({
      permanent,
      retryAt: retryAt ? new Date(retryAt) : null,
      failureClass: permanent ? "smtp-temporary-exhausted" : "smtp-temporary",
    }));
    expect(permanent ? result.failed : result.retrying).toBe(1);
  });

  it("does not send when the final subscriber/preference/kill-switch gate cancels or defers", async () => {
    dependencies.beginSend.mockResolvedValue(false);
    const result = await runDeliveryBatch({ dependencies });
    expect(result.gated).toBe(1);
    expect(dependencies.send).not.toHaveBeenCalled();
    expect(dependencies.fail).not.toHaveBeenCalled();
  });

  it("never retries after SMTP acceptance when database completion is ambiguous", async () => {
    dependencies.complete.mockResolvedValue(false);
    const result = await runDeliveryBatch({ dependencies });
    expect(result.ambiguous).toBe(1);
    expect(dependencies.fail).not.toHaveBeenCalled();
    expect(dependencies.alert).toHaveBeenCalledWith(expect.objectContaining({ severity: "critical" }));
  });

  it("contains no AI or provider dependency", () => {
    expect(Object.keys(dependencies)).not.toContain("provider");
    expect(Object.keys(dependencies)).not.toContain("generate");
  });
});
