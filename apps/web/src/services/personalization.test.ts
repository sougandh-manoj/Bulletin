import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PersonalizationCandidate } from "@/lib/personalization/rules";
import { runPersonalizationBatch } from "@/services/personalization";

const claim = {
  deliveryId: "00000000-0000-4000-8000-000000000001",
  leaseToken: "00000000-0000-4000-8000-000000000002",
  attemptCount: 1,
};

const context = {
  deliveryId: claim.deliveryId,
  subscriberId: "00000000-0000-4000-8000-000000000003",
  scheduledFor: "2026-07-19T02:30:00.000Z",
  windowStartedAt: "2026-07-18T02:30:00.000Z",
  windowEndedAt: "2026-07-19T02:30:00.000Z",
  preferenceVersion: 1,
  language: "hi" as const,
  countryCode: "IN",
  stateRegion: "Kerala",
  city: "Kochi",
  categories: ["technology-ai" as const],
  customTopics: [],
  excludedTopics: [],
  storyCount: 2,
  frequency: "daily" as const,
  weeklyDay: null,
  timezone: "Asia/Kolkata",
};

function candidate(summaryAvailable: boolean): PersonalizationCandidate {
  return {
    clusterId: `10000000-0000-4000-8000-00000000000${summaryAvailable ? 1 : 2}`,
    clusterPublicReference: `20000000-0000-4000-8000-00000000000${summaryAvailable ? 1 : 2}`,
    clusterVersion: 1,
    category: "technology-ai",
    countryCode: "IN",
    stateRegion: null,
    city: null,
    centralTopics: [summaryAvailable ? "artificial intelligence" : "quantum computing"],
    entities: {},
    eventType: "announcement",
    evidenceStrength: "strong",
    evidenceIndependenceCount: 2,
    latestEventAt: "2026-07-19T01:30:00.000Z",
    summaryId: summaryAvailable ? "30000000-0000-4000-8000-000000000001" : null,
    summaryAvailable,
    headline: "Verified technology development",
    sourceReliability: "tier-1",
    factualDepth: 3,
    previousDeliveredVersion: null,
  };
}

describe("Phase 8 personalization service", () => {
  const dependencies = {
    enqueueDue: vi.fn(),
    claim: vi.fn(),
    loadContext: vi.fn(),
    listCandidates: vi.fn(),
    enqueueLocalization: vi.fn(),
    complete: vi.fn(),
    fail: vi.fn(),
    heartbeat: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    dependencies.enqueueDue.mockResolvedValue([{ deliveryId: claim.deliveryId }]);
    dependencies.claim.mockResolvedValue([claim]);
    dependencies.loadContext.mockResolvedValue(context);
    dependencies.listCandidates.mockResolvedValue([candidate(true), candidate(false)]);
    dependencies.enqueueLocalization.mockResolvedValue("summary-localization-id");
    dependencies.complete.mockResolvedValue(true);
    dependencies.fail.mockResolvedValue(true);
    dependencies.heartbeat.mockResolvedValue(undefined);
  });

  it("stores available verified inventory and idempotently queues one shared missing localization", async () => {
    const result = await runPersonalizationBatch({
      workerId: "00000000-0000-4000-8000-000000000004",
      now: () => new Date("2026-07-19T02:31:00.000Z"),
      dependencies,
    });
    expect(result).toMatchObject({
      scheduled: 1,
      claimed: 1,
      ready: 1,
      short: 1,
      empty: 0,
      localizationQueued: 1,
      retrying: 0,
      failed: 0,
    });
    expect(dependencies.enqueueLocalization).toHaveBeenCalledWith(expect.objectContaining({
      clusterId: "10000000-0000-4000-8000-000000000002",
      language: "hi",
    }));
    expect(dependencies.complete).toHaveBeenCalledWith(expect.objectContaining({
      selected: [expect.objectContaining({
        clusterId: "10000000-0000-4000-8000-000000000001",
      })],
    }));
  });

  it("uses no provider dependency or per-subscriber AI call", async () => {
    await runPersonalizationBatch({ dependencies, now: () => new Date("2026-07-19T02:31:00.000Z") });
    expect(Object.keys(dependencies)).not.toContain("provider");
    expect(Object.keys(dependencies)).not.toContain("generate");
  });

  it("leaves an isolated failed claim resumable", async () => {
    dependencies.listCandidates.mockRejectedValue(new Error("temporary database error"));
    const result = await runPersonalizationBatch({
      dependencies,
      now: () => new Date("2026-07-19T02:31:00.000Z"),
    });
    expect(result.retrying).toBe(1);
    expect(dependencies.fail).toHaveBeenCalledWith(expect.objectContaining({
      permanent: false,
      retryAt: new Date("2026-07-19T02:36:00.000Z"),
    }));
    expect(dependencies.complete).not.toHaveBeenCalled();
  });
});
