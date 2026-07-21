import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SummaryClaim, SummaryJob } from "@/data/intelligence";
import { IntelligenceProviderError, type StorySummaryProvider } from "@/lib/intelligence/provider";
import type { SharedSummary } from "@/lib/intelligence/schemas";
import { runSharedSummaryBatch } from "@/services/shared-summaries";

const at = new Date("2026-07-18T09:00:00Z");
const claim: SummaryClaim = { summaryId: "summary-1", clusterId: "cluster-1", clusterVersion: 1, language: "en", leaseToken: "lease-1" };
const canonical: SharedSummary = {
  status: "ready", headline: "Agency opens 10 crore grant", summary: "The agency opened a 10 crore grant on 18 July. Applications are open. The program supports local projects.",
  whyItMatters: "The funding may expand local services.", citationArticleIds: ["article-1"],
  attributionMarkers: [{ articleId: "article-1", publisherName: "Public Agency" }], uncertaintyMarkers: ["may"], isUpdate: false,
};

function job(overrides: Partial<SummaryJob> = {}): SummaryJob {
  return {
    ...claim, isSensitive: false, evidenceStrength: "sufficient", evidenceResult: { policyVersion: "phase-7-v1" }, conflictDetails: [], isUpdate: false,
    evidence: [{
      id: "article-1", title: "Agency opens 10 crore grant on 18 July", description: "Applications are open and the program supports local projects.",
      canonicalUrl: "https://agency.example/grant", publishedAt: "2026-07-18T06:00:00Z", language: "en", countryCode: "IN", stateRegion: "Kerala", city: "Kochi",
      classification: null, entities: null, eventType: "grant-announcement", eventTime: "2026-07-18T06:00:00Z", keyAction: "opens grant", keyOutcome: "applications open",
      importantNumbers: [{ label: "grant", value: "10", unit: "crore", qualifier: null }], publisherName: "Public Agency", publisherFamilyKey: "public-agency",
      reliability: "tier-1", isAggregator: false, isInstitutional: true,
    }], canonical: null, ...overrides,
  };
}

function provider(outputs: unknown[]): StorySummaryProvider {
  return { name: "fixture", generationModel: "fixture-generation", generateStructured: vi.fn().mockImplementation(async () => outputs.shift()) };
}

describe("shared summary orchestration", () => {
  const claimJobs = vi.fn(); const load = vi.fn(); const complete = vi.fn(); const reserve = vi.fn(); const heartbeat = vi.fn();
  const dependencies = { claim: claimJobs, load, complete, reserve, heartbeat };
  const quota = { requestsPerMinute: 10, unitsPerMinute: 100_000, requestsPerDay: 100, unitsPerDay: 1_000_000 };

  beforeEach(() => {
    vi.clearAllMocks(); claimJobs.mockResolvedValue([claim]); load.mockResolvedValue(job()); complete.mockResolvedValue(true);
    reserve.mockResolvedValue({ allowed: true, retryAt: null, reason: null }); heartbeat.mockResolvedValue(undefined);
  });

  it("verifies one canonical summary without eagerly spending localization quota", async () => {
    const ai = provider([canonical]);
    const result = await runSharedSummaryBatch({ provider: ai, quota, now: () => at, dependencies });
    expect(result).toMatchObject({ claimed: 1, verified: 1 });
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({
      status: "verified", output: canonical, repairAttempted: false,
      verification: expect.objectContaining({ status: "ready", passed: true, unsupportedClaims: [] }),
      modelMetadata: expect.objectContaining({ generationCalls: 1, verification: "deterministic-local-v2" }),
    }));
    expect(ai.generateStructured).toHaveBeenCalledTimes(1);
  });

  it("fails closed on deterministic numeric drift without spending a second request", async () => {
    const bad = { ...canonical, summary: "The agency opened a 20 crore grant. Applications are open. The program supports local projects." };
    const ai = provider([bad, canonical]);
    const result = await runSharedSummaryBatch({ provider: ai, quota, now: () => at, dependencies });
    expect(result.failed).toBe(1); expect(ai.generateStructured).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ status: "invalid-input", errorCode: "summary-grounding-failed", repairAttempted: false }));
  });

  it("fails closed on an invalid citation without a repair request", async () => {
    const bad = { ...canonical, citationArticleIds: ["invented"] };
    const ai = provider([bad, bad]);
    const result = await runSharedSummaryBatch({ provider: ai, quota, now: () => at, dependencies });
    expect(result.failed).toBe(1);
    expect(ai.generateStructured).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ status: "invalid-input", errorCode: "summary-grounding-failed", repairAttempted: false }));
  });

  it("preserves the canonical citations and target script for Hindi localization", async () => {
    const hindiClaim = { ...claim, language: "hi" as const };
    claimJobs.mockResolvedValue([hindiClaim]); load.mockResolvedValue(job({ ...hindiClaim, canonical }));
    const hindi = { ...canonical, language: "hi" as const, headline: "एजेंसी ने 10 करोड़ का अनुदान खोला", summary: "एजेंसी ने 18 जुलाई को 10 करोड़ का अनुदान खोला। आवेदन खुले हैं। कार्यक्रम स्थानीय परियोजनाओं का समर्थन करता है।", whyItMatters: "यह वित्तपोषण स्थानीय सेवाओं का विस्तार कर सकता है।" };
    const ai = provider([hindi]);
    const result = await runSharedSummaryBatch({ provider: ai, quota, now: () => at, dependencies });
    expect(result.verified).toBe(1);
    expect(ai.generateStructured).toHaveBeenCalledTimes(1);
  });

  it("marks weak or conflicting jobs without any model call", async () => {
    load.mockResolvedValue(job({ evidenceStrength: "weak" }));
    const ai = provider([]);
    const result = await runSharedSummaryBatch({ provider: ai, quota, now: () => at, dependencies });
    expect(result.insufficientEvidence).toBe(1); expect(ai.generateStructured).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ status: "insufficient-evidence" }));
  });

  it("isolates transient provider errors as resumable retry-wait jobs", async () => {
    const ai = provider([]); vi.mocked(ai.generateStructured).mockRejectedValue(new IntelligenceProviderError("provider-timeout", "timeout", true));
    const result = await runSharedSummaryBatch({ provider: ai, quota, now: () => at, dependencies });
    expect(result.retrying).toBe(1);
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ status: "retry-wait", retryAt: new Date("2026-07-18T09:15:00Z") }));
  });

  it("stops provider calls after the first unavailable-model response", async () => {
    const claims = Array.from({ length: 4 }, (_, index) => ({
      ...claim, summaryId: `summary-${index + 1}`, leaseToken: `lease-${index + 1}`,
    }));
    claimJobs.mockResolvedValue(claims);
    const ai = provider([]);
    vi.mocked(ai.generateStructured).mockRejectedValue(new IntelligenceProviderError("provider-model-unavailable", "missing model", false));
    const result = await runSharedSummaryBatch({ provider: ai, quota, now: () => at, dependencies });
    expect(result).toMatchObject({ claimed: 4, retrying: 4, failed: 0 });
    expect(ai.generateStructured).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledTimes(4);
  });
});
