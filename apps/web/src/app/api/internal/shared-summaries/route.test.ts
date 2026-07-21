import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getIngestionEnvironment: vi.fn(), getIntelligenceEnvironment: vi.fn(), createStorySummaryProvider: vi.fn(), runSharedSummaryBatch: vi.fn() }));
vi.mock("@/env/server", () => ({ getIngestionEnvironment: mocks.getIngestionEnvironment, getIntelligenceEnvironment: mocks.getIntelligenceEnvironment, getServerEnvironment: () => ({ LOG_LEVEL: "error" }) }));
vi.mock("@/lib/intelligence/factory", () => ({ createStorySummaryProvider: mocks.createStorySummaryProvider }));
vi.mock("@/services/shared-summaries", () => ({ runSharedSummaryBatch: mocks.runSharedSummaryBatch }));

import { POST } from "@/app/api/internal/shared-summaries/route";

const secret = "phase-seven-cron-secret-is-at-least-32-characters";
const environment = {
  CRON_SHARED_SECRET: secret, SHARED_SUMMARY_BATCH_SIZE: 4, SHARED_SUMMARY_LEASE_SECONDS: 420,
  PROVIDER_REQUESTS_PER_MINUTE: 10, PROVIDER_INPUT_UNITS_PER_MINUTE: 100_000, PROVIDER_REQUESTS_PER_DAY: 100,
  PROVIDER_INPUT_UNITS_PER_DAY: 1_000_000,
};
function request(authorization?: string) {
  return new Request("https://bulletin.example/api/internal/shared-summaries", { method: "POST", headers: authorization ? { Authorization: authorization } : {} });
}

describe("protected shared-summary route", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.getIngestionEnvironment.mockReturnValue(environment); mocks.getIntelligenceEnvironment.mockReturnValue(environment); mocks.createStorySummaryProvider.mockReturnValue({ name: "fixture" });
    mocks.runSharedSummaryBatch.mockResolvedValue({ workerId: "private", claimed: 2, verified: 1, retrying: 1, failed: 0, insufficientEvidence: 0, conflictingEvidence: 0 });
  });

  it("rejects an invalid bearer secret without claiming a summary", async () => {
    const response = await POST(request("Bearer wrong")); expect(response.status).toBe(401);
    expect(mocks.createStorySummaryProvider).not.toHaveBeenCalled(); expect(mocks.runSharedSummaryBatch).not.toHaveBeenCalled();
    expect(mocks.getIntelligenceEnvironment).not.toHaveBeenCalled();
  });

  it("runs one bounded summary batch and returns no story content", async () => {
    const response = await POST(request(`Bearer ${secret}`)); expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, claimed: 2, verified: 1, retrying: 1, failed: 0, insufficientEvidence: 0, conflictingEvidence: 0 });
    expect(mocks.runSharedSummaryBatch).toHaveBeenCalledWith(expect.objectContaining({ batchSize: 4, leaseSeconds: 420 }));
  });

  it("returns a generic 503 without leaking model or database errors", async () => {
    mocks.runSharedSummaryBatch.mockRejectedValue(new Error("raw model output"));
    const response = await POST(request(`Bearer ${secret}`));
    expect(response.status).toBe(503); expect(await response.json()).toEqual({ ok: false, message: "Shared summaries are temporarily unavailable" });
  });
});
