import { beforeEach, describe, expect, it, vi } from "vitest";

import { IntelligenceDataError, type ClaimedArticle, type ClusterCandidate } from "@/data/intelligence";
import { analyzeArticleLocally } from "@/lib/intelligence/local-analysis";
import type { ArticleClassification } from "@/lib/intelligence/schemas";
import { runIntelligenceBatch } from "@/services/intelligence";

const at = new Date("2026-07-18T08:00:00Z");

function article(id = "article-1", overrides: Partial<ClaimedArticle> = {}): ClaimedArticle {
  return {
    id, leaseToken: `lease-${id}`, sourceId: `source-${id}`, title: "Agency opens 10 crore grant", normalizedTitle: "agency opens 10 crore grant",
    description: "Applications opened in Kochi on 18 July.", canonicalUrl: `https://example.com/${id}`, publishedAt: "2026-07-18T06:00:00Z",
    language: "en", countryCode: "IN", stateRegion: "Kerala", city: "Kochi", author: null, feedCategories: ["policy"], processingAttempts: 1,
    classification: null, entities: null, eventType: null, eventTime: null, keyAction: null, keyOutcome: null, importantNumbers: [],
    publisherName: `Publisher ${id}`, publisherFamilyKey: `publisher-${id}`, reliability: "tier-1", isAggregator: false, isInstitutional: false,
    ...overrides,
  };
}

function classification(id = "article-1", overrides: Partial<ArticleClassification> = {}): ArticleClassification {
  const value = article(id);
  return {
    ...analyzeArticleLocally({
      id: value.id, title: value.title, description: value.description, publishedAt: value.publishedAt,
      language: value.language, countryCode: value.countryCode, stateRegion: value.stateRegion,
      city: value.city, feedCategories: value.feedCategories,
    }),
    ...overrides,
  };
}

function candidate(overrides: Partial<ClusterCandidate["snapshot"]> = {}): ClusterCandidate {
  return {
    clusterId: "cluster-1", ruleScore: 85,
    snapshot: {
      id: "cluster-1", status: "verified", category: "government-schemes", countryCode: "IN", stateRegion: "Kerala", city: "Kochi",
      centralTopics: classification().topics, entities: classification().entities, eventType: classification().eventType, eventTime: classification().eventTime,
      keyAction: classification().keyAction, keyOutcome: classification().keyOutcome, importantNumbers: classification().importantNumbers,
      isSensitive: false, currentVersion: 1, latestEventAt: "2026-07-18T06:00:00Z", evidenceArticles: [], ...overrides,
    },
  };
}

describe("story intelligence orchestration", () => {
  const claim = vi.fn(); const stage = vi.fn(); const candidates = vi.fn(); const commit = vi.fn(); const promote = vi.fn();
  const finish = vi.fn(); const heartbeat = vi.fn();
  const dependencies = { claim, stage, candidates, commit, promote, finish, heartbeat };

  beforeEach(() => {
    vi.clearAllMocks(); stage.mockResolvedValue(true); candidates.mockResolvedValue([]); finish.mockResolvedValue(true); heartbeat.mockResolvedValue(undefined);
    commit.mockResolvedValue({ clusterId: "cluster-new", clusterVersion: 1, clusterStatus: "verified", evidenceStrength: "sufficient", independentEvidenceUnits: 1, meaningfulUpdate: false, summaryQueued: true });
    promote.mockImplementation(async ({ commit: value }) => value);
  });

  it("stages local intelligence and atomically commits a new factual event", async () => {
    claim.mockResolvedValue([article()]);
    const result = await runIntelligenceBatch({ now: () => at, dependencies });
    expect(result).toMatchObject({ claimed: 1, processed: 1, summariesQueued: 1, failed: 0 });
    expect(stage).toHaveBeenCalledWith(expect.objectContaining({
      classification: expect.objectContaining({ status: "ready", category: "government-schemes" }),
      fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
      metadata: expect.objectContaining({ analysisVersion: "title-only-v1", policyVersion: "title-only-v1" }),
    }));
    expect(commit).toHaveBeenCalledWith(expect.objectContaining({ preferredClusterId: null, decisionMethod: "normalized-title-unique-story" }));
    expect(promote).toHaveBeenCalled();
  });

  it("does not merge a candidate whose title is unrelated", async () => {
    claim.mockResolvedValue([article()]);
    candidates.mockResolvedValue([candidate({ stateRegion: "Delhi", city: "Delhi", entities: { people: [], organizations: ["Other Agency"], locations: ["Delhi"] } })]);
    await runIntelligenceBatch({ now: () => at, dependencies });
    expect(commit).toHaveBeenCalledWith(expect.objectContaining({ preferredClusterId: null }));
  });

  it("merges sufficiently similar titles without using category, geography, or sensitivity", async () => {
    claim.mockResolvedValue([article()]); candidates.mockResolvedValue([candidate({
      isSensitive: true, category: "world", stateRegion: "Delhi",
      evidenceArticles: [article("evidence-1", { title: "Agency opens ₹10 crore grant for applicants" })],
    })]);
    await runIntelligenceBatch({ now: () => at, dependencies });
    expect(commit).toHaveBeenCalledWith(expect.objectContaining({ preferredClusterId: "cluster-1", decisionMethod: "normalized-title-similarity" }));
  });

  it("quarantines a locally detected opinion before clustering", async () => {
    claim.mockResolvedValue([article("article-1", { title: "Opinion: This grant will change the city" })]);
    const result = await runIntelligenceBatch({ now: () => at, dependencies });
    expect(result.quarantined).toBe(1); expect(stage).not.toHaveBeenCalled(); expect(commit).not.toHaveBeenCalled();
    expect(finish).toHaveBeenCalledWith(expect.objectContaining({ status: "quarantined", errorCode: "local-analysis-opinion" }));
  });

  it("isolates a transient database failure and continues the next article", async () => {
    claim.mockResolvedValue([article("article-1"), article("article-2")]);
    stage.mockRejectedValueOnce(new Error("temporary database failure")).mockResolvedValueOnce(true);
    const result = await runIntelligenceBatch({ now: () => at, dependencies });
    expect(result).toMatchObject({ claimed: 2, failed: 1, processed: 1 });
  });

  it("retries typed database failures without involving an AI provider", async () => {
    claim.mockResolvedValue([article("article-1")]);
    stage.mockRejectedValueOnce(new IntelligenceDataError("database-timeout"));
    const result = await runIntelligenceBatch({ now: () => at, dependencies });
    expect(result).toMatchObject({ claimed: 1, retrying: 1, processed: 0 });
    expect(finish).toHaveBeenCalledWith(expect.objectContaining({ article: expect.objectContaining({ id: "article-1" }), status: "retry-wait" }));
  });

  it("retries transient fetch failures instead of permanently dropping an article", async () => {
    claim.mockResolvedValue([article("article-1")]);
    stage.mockRejectedValueOnce(new TypeError("fetch failed"));
    const result = await runIntelligenceBatch({ now: () => at, dependencies });
    expect(result).toMatchObject({ claimed: 1, retrying: 1, failed: 0 });
    expect(finish).toHaveBeenCalledWith(expect.objectContaining({ status: "retry-wait", errorCode: "transient-intelligence-request" }));
  });
});
