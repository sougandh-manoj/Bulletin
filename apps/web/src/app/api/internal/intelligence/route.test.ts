import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getIngestionEnvironment: vi.fn(), runIntelligenceBatch: vi.fn() }));
vi.mock("@/env/server", () => ({ getIngestionEnvironment: mocks.getIngestionEnvironment, getServerEnvironment: () => ({ LOG_LEVEL: "error" }) }));
vi.mock("@/services/intelligence", () => ({ runIntelligenceBatch: mocks.runIntelligenceBatch }));

import { POST } from "@/app/api/internal/intelligence/route";

const secret = "phase-seven-cron-secret-is-at-least-32-characters";
const environment = {
  CRON_SHARED_SECRET: secret, INTELLIGENCE_BATCH_SIZE: 5, INTELLIGENCE_LEASE_SECONDS: 300,
  INTELLIGENCE_CANDIDATE_LIMIT: 12, INTELLIGENCE_CANDIDATE_LOOKBACK_HOURS: 96,
};

function request(authorization?: string) {
  return new Request("https://bulletin.example/api/internal/intelligence", { method: "POST", headers: authorization ? { Authorization: authorization } : {} });
}

describe("protected story-intelligence route", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.getIngestionEnvironment.mockReturnValue(environment);
    mocks.runIntelligenceBatch.mockResolvedValue({ workerId: "private", claimed: 2, processed: 1, quarantined: 1, retrying: 0, failed: 0, clustersCreatedOrJoined: 1, meaningfulUpdates: 0, summariesQueued: 1 });
  });

  it("rejects missing or invalid bearer credentials before running local clustering", async () => {
    expect((await POST(request())).status).toBe(401); expect((await POST(request("Bearer wrong"))).status).toBe(401);
    expect(mocks.runIntelligenceBatch).not.toHaveBeenCalled();
  });

  it("returns only bounded aggregate counts to an authorized caller", async () => {
    const response = await POST(request(`Bearer ${secret}`));
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({ ok: true, claimed: 2, processed: 1, quarantined: 1, retrying: 0, failed: 0, clustersCreatedOrJoined: 1, meaningfulUpdates: 0, summariesQueued: 1 });
    expect(mocks.runIntelligenceBatch).toHaveBeenCalledWith(expect.objectContaining({
      batchSize: 5, candidateLimit: 12, candidateLookbackHours: 96,
    }));
  });

  it("fails with a generic private response when local clustering fails", async () => {
    mocks.runIntelligenceBatch.mockRejectedValue(new Error("database unavailable"));
    const response = await POST(request(`Bearer ${secret}`));
    expect(response.status).toBe(503); expect(await response.json()).toEqual({ ok: false, message: "Story intelligence is temporarily unavailable" });
  });
});
