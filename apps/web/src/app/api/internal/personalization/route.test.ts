import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getIngestionEnvironment: vi.fn(),
  runPersonalizationBatch: vi.fn(),
}));

vi.mock("@/env/server", () => ({
  getIngestionEnvironment: mocks.getIngestionEnvironment,
  getServerEnvironment: () => ({ LOG_LEVEL: "error" }),
}));
vi.mock("@/services/personalization", () => ({
  runPersonalizationBatch: mocks.runPersonalizationBatch,
}));

import { POST } from "@/app/api/internal/personalization/route";

const secret = "phase-eight-cron-secret-is-at-least-32-characters";
const environment = {
  CRON_SHARED_SECRET: secret,
  DELIVERY_SCHEDULER_BATCH_SIZE: 50,
  PERSONALIZATION_BATCH_SIZE: 10,
  PERSONALIZATION_LEASE_SECONDS: 180,
};

function request(authorization?: string) {
  return new Request("https://bulletin.example/api/internal/personalization", {
    method: "POST",
    headers: authorization ? { Authorization: authorization } : {},
  });
}

describe("protected personalization route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getIngestionEnvironment.mockReturnValue(environment);
    mocks.runPersonalizationBatch.mockResolvedValue({
      workerId: "private",
      scheduled: 2,
      claimed: 2,
      ready: 2,
      short: 1,
      empty: 0,
      localizationQueued: 1,
      retrying: 0,
      failed: 0,
    });
  });

  it("rejects missing or invalid bearer credentials before any scheduling work", async () => {
    expect((await POST(request())).status).toBe(401);
    expect((await POST(request("Bearer wrong"))).status).toBe(401);
    expect(mocks.runPersonalizationBatch).not.toHaveBeenCalled();
  });

  it("returns only aggregate counts to an authorized worker caller", async () => {
    const response = await POST(request(`Bearer ${secret}`));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({
      ok: true,
      scheduled: 2,
      claimed: 2,
      ready: 2,
      short: 1,
      empty: 0,
      localizationQueued: 1,
      retrying: 0,
      failed: 0,
    });
    expect(mocks.runPersonalizationBatch).toHaveBeenCalledWith({
      schedulerBatchSize: 50,
      personalizationBatchSize: 10,
      leaseSeconds: 180,
    });
  });

  it("fails with a generic private response", async () => {
    mocks.runPersonalizationBatch.mockRejectedValue(new Error("database unavailable"));
    const response = await POST(request(`Bearer ${secret}`));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      ok: false,
      message: "Personalization is temporarily unavailable",
    });
  });
});
