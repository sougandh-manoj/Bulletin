import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ environment: vi.fn(), run: vi.fn() }));
vi.mock("@/env/server", () => ({ getIngestionEnvironment: mocks.environment, getServerEnvironment: () => ({ LOG_LEVEL: "error" }) }));
vi.mock("@/services/delivery", () => ({ runDeliveryBatch: mocks.run }));

import { POST } from "./route";

const secret = "phase-nine-cron-secret-at-least-thirty-two-characters";
function request(auth?: string) { return new Request("https://bulletin.example/api/internal/delivery", { method: "POST", headers: auth ? { Authorization: auth } : {} }); }

describe("protected Phase 9 delivery route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.environment.mockReturnValue({ CRON_SHARED_SECRET: secret, DELIVERY_BATCH_SIZE: 10, DELIVERY_LEASE_SECONDS: 300 });
    mocks.run.mockResolvedValue({ recovered: 1, ambiguousRecovered: 0, claimed: 2, sent: 1, retrying: 1, failed: 0, gated: 0, ambiguous: 0 });
  });
  it("rejects missing/invalid internal worker credentials", async () => {
    expect((await POST(request())).status).toBe(401);
    expect((await POST(request("Bearer wrong"))).status).toBe(401);
    expect(mocks.run).not.toHaveBeenCalled();
  });
  it("returns only aggregate delivery state", async () => {
    const response = await POST(request(`Bearer ${secret}`));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({ ok: true, recovered: 1, ambiguousRecovered: 0, claimed: 2, sent: 1, retrying: 1, failed: 0, gated: 0, ambiguous: 0 });
  });
});
