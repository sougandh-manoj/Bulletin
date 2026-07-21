import { describe, expect, it } from "vitest";

import type { NewsCategory } from "@/config/product";
import {
  PERSONALIZATION_RULES,
  geographicTier,
  personalize,
  scoreCandidate,
  type PersonalizationCandidate,
  type PersonalizationContext,
} from "@/lib/personalization/rules";

const context: PersonalizationContext = {
  language: "en",
  countryCode: "IN",
  stateRegion: "Kerala",
  city: "Kochi",
  categories: ["technology-ai", "science", "health"],
  customTopics: [],
  excludedTopics: [],
  storyCount: 3,
  scheduledFor: "2026-07-19T02:30:00.000Z",
  windowStartedAt: "2026-07-18T02:30:00.000Z",
  windowEndedAt: "2026-07-19T02:30:00.000Z",
};

let sequence = 0;

function candidate(overrides: Partial<PersonalizationCandidate> = {}): PersonalizationCandidate {
  sequence += 1;
  const id = sequence.toString().padStart(12, "0");
  return {
    clusterId: `00000000-0000-4000-8000-${id}`,
    clusterPublicReference: `10000000-0000-4000-8000-${id}`,
    clusterVersion: 1,
    category: "technology-ai",
    countryCode: null,
    stateRegion: null,
    city: null,
    centralTopics: [`topic-${sequence}`],
    entities: {},
    eventType: "announcement",
    evidenceStrength: "strong",
    evidenceIndependenceCount: 2,
    latestEventAt: "2026-07-19T01:30:00.000Z",
    summaryId: `20000000-0000-4000-8000-${id}`,
    summaryAvailable: true,
    headline: `Verified story ${sequence}`,
    sourceReliability: "tier-1",
    factualDepth: 3,
    previousDeliveredVersion: null,
    ...overrides,
  };
}

describe("Phase 8 deterministic personalization rules", () => {
  it("requires a selected category unless a custom topic independently qualifies the story", () => {
    const outside = candidate({ category: "sports", centralTopics: ["lunar mission"] });
    expect(personalize(context, [outside]).selected).toHaveLength(0);

    const customContext = { ...context, customTopics: ["lunar mission"] };
    const decision = personalize(customContext, [outside]);
    expect(decision.selected).toHaveLength(1);
    expect(decision.selected[0].reasons.selectedCategory).toBe(false);
    expect(decision.selected[0].reasons.customTopicMatches).toEqual(["lunar mission"]);
  });

  it("blocks central exclusions but ignores an incidental headline mention", () => {
    const exclusionContext = { ...context, excludedTopics: ["celebrity gossip"] };
    const central = candidate({ centralTopics: ["celebrity gossip"] });
    const incidental = candidate({
      centralTopics: ["artificial intelligence policy"],
      headline: "AI policy report briefly mentions celebrity gossip",
    });
    const decision = personalize(exclusionContext, [central, incidental]);
    expect(decision.excluded.centralTopic).toBe(1);
    expect(decision.selected.map((item) => item.clusterId)).toEqual([incidental.clusterId]);
  });

  it("applies national, then state, then city geographic priority", () => {
    const national = candidate({ countryCode: "IN" });
    const state = candidate({ countryCode: "IN", stateRegion: "Kerala" });
    const city = candidate({ countryCode: "IN", stateRegion: "Kerala", city: "Kochi" });
    expect(geographicTier(context, national)).toBe("national");
    expect(geographicTier(context, state)).toBe("state");
    expect(geographicTier(context, city)).toBe("city");
    const scores = [national, state, city].map((item) => scoreCandidate(context, item)!.score);
    expect(scores[0]).toBeGreaterThan(scores[1]);
    expect(scores[1]).toBeGreaterThan(scores[2]);
  });

  it("rewards evidence, source quality, factual depth, recency, and meaningful updates", () => {
    const weakSignals = candidate({
      evidenceStrength: "sufficient",
      evidenceIndependenceCount: 1,
      sourceReliability: "tier-3",
      factualDepth: 1,
      latestEventAt: "2026-07-18T03:00:00.000Z",
    });
    const strongSignals = candidate({
      evidenceStrength: "strong",
      evidenceIndependenceCount: 4,
      sourceReliability: "tier-1",
      factualDepth: 3,
      latestEventAt: "2026-07-19T02:00:00.000Z",
      clusterVersion: 2,
      previousDeliveredVersion: 1,
    });
    const weakScore = scoreCandidate(context, weakSignals)!.score;
    const strongScore = scoreCandidate(context, strongSignals)!.score;
    expect(strongScore).toBeGreaterThan(weakScore);
    expect(scoreCandidate(context, strongSignals)!.reasons.meaningfulUpdate).toBe(true);
  });

  it("suppresses an already-delivered version but admits a meaningful newer version", () => {
    const repeat = candidate({ clusterVersion: 2, previousDeliveredVersion: 2 });
    const update = candidate({ clusterVersion: 3, previousDeliveredVersion: 2 });
    const decision = personalize(context, [repeat, update]);
    expect(decision.excluded.alreadyDelivered).toBe(1);
    expect(decision.selected.map((item) => item.clusterId)).toEqual([update.clusterId]);
  });

  it("balances categories and favors distinct subjects when strong alternatives exist", () => {
    const fiveStoryContext = {
      ...context,
      categories: [...context.categories, "business-economy"] as NewsCategory[],
      storyCount: 12,
    };
    const technology = Array.from({ length: 4 }, (_, index) => candidate({
      category: "technology-ai",
      centralTopics: index < 2 ? ["semiconductor policy"] : [`technology-${index}`],
    }));
    const alternatives = [
      candidate({ category: "science", centralTopics: ["lunar science"] }),
      candidate({ category: "science", centralTopics: ["ocean science"] }),
      candidate({ category: "science", centralTopics: ["climate science"] }),
      candidate({ category: "health", centralTopics: ["public health"] }),
      candidate({ category: "health", centralTopics: ["clinical care"] }),
      candidate({ category: "health", centralTopics: ["hospital capacity"] }),
      candidate({ category: "business-economy", centralTopics: ["economic policy"] }),
      candidate({ category: "business-economy", centralTopics: ["trade policy"] }),
      candidate({ category: "business-economy", centralTopics: ["industry output"] }),
    ];
    const decision = personalize(fiveStoryContext, [...technology, ...alternatives]);
    expect(decision.selected).toHaveLength(12);
    expect(decision.selected.filter((item) => item.category === "technology-ai")).toHaveLength(3);
    expect(decision.selected.filter((item) => item.subjectKey === "semiconductor policy")).toHaveLength(1);
  });

  it("reserves three available stories for every selected category before filling extras", () => {
    const categories: NewsCategory[] = [
      "india", "world", "startups", "technology-ai", "education-careers", "entertainment",
    ];
    const coverageContext = { ...context, categories, storyCount: 18 };
    const inventory = categories.flatMap((category) => [
      candidate({ category, centralTopics: [`${category}-one`] }),
      candidate({ category, centralTopics: [`${category}-two`] }),
      candidate({ category, centralTopics: [`${category}-three`] }),
      candidate({ category, centralTopics: [`${category}-four`] }),
    ]);
    const decision = personalize(coverageContext, inventory);
    expect(decision.selected).toHaveLength(18);
    for (const category of categories) {
      expect(decision.selected.filter((item) => item.category === category)).toHaveLength(3);
    }
  });

  it("relaxes category diversity for a subscriber who selected one category", () => {
    const singleCategoryContext = {
      ...context,
      categories: ["technology-ai"] as NewsCategory[],
      storyCount: 4,
    };
    const decision = personalize(
      singleCategoryContext,
      Array.from({ length: 4 }, (_, index) => candidate({ centralTopics: [`single-${index}`] })),
    );
    expect(decision.selected).toHaveLength(4);
    expect(new Set(decision.selected.map((item) => item.category))).toEqual(new Set(["technology-ai"]));
  });

  it("keeps baseline verified reporting instead of over-filtering it", () => {
    const strong = candidate();
    const filler = candidate({
      evidenceStrength: "sufficient",
      evidenceIndependenceCount: 1,
      sourceReliability: "tier-3",
      factualDepth: 0,
      latestEventAt: context.windowStartedAt,
    });
    const short = personalize({ ...context, storyCount: 3 }, [strong, filler]);
    expect(short.selected).toHaveLength(2);
    expect(short.excluded.belowQualityFloor).toBe(0);
    expect(PERSONALIZATION_RULES.minimumScore).toBe(scoreCandidate(context, filler)!.score);
    expect(personalize(context, [filler]).selected).toHaveLength(1);
  });

  it("selects only verified available language inventory and queues shared missing localizations", () => {
    const hindiContext = { ...context, language: "hi" as const, storyCount: 2 };
    const localized = candidate({ summaryAvailable: true });
    const missing = candidate({ summaryAvailable: false, summaryId: null });
    const decision = personalize(hindiContext, [localized, missing]);
    expect(decision.selected.map((item) => item.clusterId)).toEqual([localized.clusterId]);
    expect(decision.localizationNeeded.map((item) => item.clusterId)).toEqual([missing.clusterId]);
    expect(decision.excluded.localizationUnavailable).toBe(1);
  });
});
