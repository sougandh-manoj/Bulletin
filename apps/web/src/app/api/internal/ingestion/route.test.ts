import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getIngestionEnvironment: vi.fn(),
  runIngestionBatch: vi.fn(),
}));

vi.mock("@/env/server", () => ({
  getIngestionEnvironment: mocks.getIngestionEnvironment,
  getServerEnvironment: () => ({ LOG_LEVEL: "error" }),
}));
vi.mock("@/services/ingestion", () => ({ runIngestionBatch: mocks.runIngestionBatch }));

import { POST } from "@/app/api/internal/ingestion/route";

const secret = "phase-six-cron-secret-is-at-least-32-characters";
const environment = {
  CRON_SHARED_SECRET: secret,
  INGESTION_BATCH_SIZE: 4,
  INGESTION_LEASE_SECONDS: 300,
  INGESTION_TIMEOUT_MS: 8_000,
  INGESTION_MAX_RESPONSE_BYTES: 2_097_152,
};

function request(authorization?: string) {
  return new Request("https://bulletin.example/api/internal/ingestion", {
    method: "POST",
    headers: authorization ? { Authorization: authorization } : {},
  });
}

describe("protected ingestion route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getIngestionEnvironment.mockReturnValue(environment);
    mocks.runIngestionBatch.mockResolvedValue({
      workerId: "not-returned",
      claimed: 2,
      succeeded: 1,
      notModified: 1,
      failed: 0,
      parsedEntries: 3,
      rejectedEntries: 1,
      insertedArticles: 1,
      exactDuplicates: 1,
      nearDuplicates: 0,
    });
  });

  it("rejects missing and incorrect bearer secrets before claiming work", async () => {
    const missing = await POST(request());
    const incorrect = await POST(request("Bearer incorrect-secret"));
    expect(missing.status).toBe(401);
    expect(incorrect.status).toBe(401);
    expect(missing.headers.get("www-authenticate")).toBe("Bearer");
    expect(mocks.runIngestionBatch).not.toHaveBeenCalled();
  });

  it("runs one bounded batch for the exact server-only bearer secret", async () => {
    const response = await POST(request(`Bearer ${secret}`));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({
      ok: true,
      claimed: 2,
      succeeded: 1,
      notModified: 1,
      failed: 0,
      parsedEntries: 3,
      rejectedEntries: 1,
      insertedArticles: 1,
      exactDuplicates: 1,
      nearDuplicates: 0,
    });
    expect(mocks.runIngestionBatch).toHaveBeenCalledWith({
      batchSize: 4,
      leaseSeconds: 300,
      timeoutMs: 8_000,
      maxBytes: 2_097_152,
    });
  });

  it("returns a generic private 503 without exposing worker or database errors", async () => {
    mocks.runIngestionBatch.mockRejectedValue(new Error("database credential details"));
    const response = await POST(request(`Bearer ${secret}`));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      ok: false,
      message: "Ingestion is temporarily unavailable",
    });
  });
});
