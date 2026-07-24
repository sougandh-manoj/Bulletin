import type {
  NewsCategory,
  SupportedLanguage,
} from "@/config/product";

export const PERSONALIZATION_VERSION = "phase-10-category-coverage-v4";

export const PERSONALIZATION_RULES = Object.freeze({
  // A verified story in a selected category reaches 30 even at the baseline
  // evidence/source tiers. Ranking should order news, not erase coverage.
  minimumScore: 30,
  maximumCandidatePool: 500,
  maximumLocalizationQueuesPerDelivery: 10,
  weights: Object.freeze({
    selectedCategory: 18,
    customTopic: 24,
    geography: Object.freeze({ national: 14, state: 9, city: 6, none: 0 }),
    evidence: Object.freeze({ strong: 14, sufficient: 8 }),
    source: Object.freeze({ "tier-1": 10, "tier-2": 7, "tier-3": 4 }),
    factualDepth: Object.freeze([0, 3, 6, 9] as const),
    maximumRecency: 14,
    meaningfulUpdate: 8,
    additionalEvidenceUnit: 2,
    maximumAdditionalEvidence: 6,
    repeatedCategoryPenalty: 3,
    repeatedSubjectPenalty: 12,
  }),
});

export type PersonalizationContext = {
  language: SupportedLanguage;
  countryCode: string;
  stateRegion: string;
  city: string | null;
  categories: NewsCategory[];
  customTopics: string[];
  excludedTopics: string[];
  storyCount: number;
  scheduledFor: string;
  windowStartedAt: string;
  windowEndedAt: string;
};

export type PersonalizationCandidate = {
  clusterId: string;
  clusterPublicReference: string;
  clusterVersion: number;
  category: NewsCategory;
  countryCode: string | null;
  stateRegion: string | null;
  city: string | null;
  centralTopics: string[];
  entities: Record<string, unknown>;
  eventType: string | null;
  evidenceStrength: "sufficient" | "strong";
  evidenceIndependenceCount: number;
  latestEventAt: string;
  summaryId: string | null;
  summaryAvailable: boolean;
  headline: string;
  sourceReliability: "tier-1" | "tier-2" | "tier-3";
  factualDepth: number;
  previousDeliveredVersion: number | null;
};

export type GeographicTier = "national" | "state" | "city" | "none";

export type ScoredCandidate = PersonalizationCandidate & {
  score: number;
  subjectKey: string;
  reasons: {
    selectedCategory: boolean;
    customTopicMatches: string[];
    geographicTier: GeographicTier;
    evidenceStrength: "sufficient" | "strong";
    sourceReliability: "tier-1" | "tier-2" | "tier-3";
    factualDepth: number;
    recencyPoints: number;
    meaningfulUpdate: boolean;
    additionalEvidencePoints: number;
  };
};

export type PersonalizationDecision = {
  selected: ScoredCandidate[];
  localizationNeeded: ScoredCandidate[];
  excluded: {
    alreadyDelivered: number;
    centralTopic: number;
    outsidePreferences: number;
    belowQualityFloor: number;
    localizationUnavailable: number;
  };
};

function normalized(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("und")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizedEqual(left: string | null, right: string | null): boolean {
  return Boolean(left && right && normalized(left) === normalized(right));
}

function entityStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(entityStrings);
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap(entityStrings);
  }
  return [];
}

function phraseMatches(topic: string, fields: string[]): boolean {
  const needle = normalized(topic);
  if (!needle) return false;
  const needleTokens = needle.split(" ");
  return fields.some((field) => {
    const haystack = normalized(field);
    if (!haystack) return false;
    if (` ${haystack} `.includes(` ${needle} `)) return true;
    if (needleTokens.length < 2) return false;
    const haystackTokens = new Set(haystack.split(" "));
    return needleTokens.every((token) => haystackTokens.has(token));
  });
}

export function hasCentralExclusion(
  candidate: Pick<PersonalizationCandidate, "centralTopics">,
  excludedTopics: string[],
): boolean {
  return excludedTopics.some((topic) => phraseMatches(topic, candidate.centralTopics));
}

export function matchingCustomTopics(
  candidate: Pick<PersonalizationCandidate, "centralTopics" | "entities" | "headline">,
  customTopics: string[],
): string[] {
  const strongFields = [
    ...candidate.centralTopics,
    ...entityStrings(candidate.entities),
    candidate.headline,
  ];
  return customTopics.filter((topic) => phraseMatches(topic, strongFields));
}

export function geographicTier(
  context: Pick<PersonalizationContext, "countryCode" | "stateRegion" | "city">,
  candidate: Pick<PersonalizationCandidate, "countryCode" | "stateRegion" | "city">,
): GeographicTier {
  if (candidate.countryCode === "IN" && !candidate.stateRegion && !candidate.city) {
    return "national";
  }
  if (candidate.city && normalizedEqual(candidate.city, context.city)) return "city";
  if (candidate.stateRegion && normalizedEqual(candidate.stateRegion, context.stateRegion)) {
    return "state";
  }
  return "none";
}

function recencyPoints(context: PersonalizationContext, candidate: PersonalizationCandidate): number {
  const start = new Date(context.windowStartedAt).getTime();
  const end = new Date(context.windowEndedAt).getTime();
  const event = new Date(candidate.latestEventAt).getTime();
  if (![start, end, event].every(Number.isFinite) || end <= start) return 0;
  const position = Math.max(0, Math.min(1, (event - start) / (end - start)));
  return Math.round(position * PERSONALIZATION_RULES.weights.maximumRecency * 100) / 100;
}

function subjectKey(candidate: PersonalizationCandidate): string {
  const primaryTopic = candidate.centralTopics.map(normalized).find(Boolean);
  if (primaryTopic) return primaryTopic.slice(0, 200);
  const entity = entityStrings(candidate.entities).map(normalized).find(Boolean);
  const fallback = [candidate.eventType, entity, candidate.category].filter(Boolean).join(" ");
  return (normalized(fallback) || candidate.clusterPublicReference).slice(0, 200);
}

export function scoreCandidate(
  context: PersonalizationContext,
  candidate: PersonalizationCandidate,
): ScoredCandidate | null {
  if (
    candidate.previousDeliveredVersion !== null
    && candidate.previousDeliveredVersion >= candidate.clusterVersion
  ) return null;
  if (hasCentralExclusion(candidate, context.excludedTopics)) return null;

  const selectedCategory = context.categories.includes(candidate.category);
  const customTopicMatches = matchingCustomTopics(candidate, context.customTopics);
  if (!selectedCategory && customTopicMatches.length === 0) return null;

  const geography = geographicTier(context, candidate);
  const recency = recencyPoints(context, candidate);
  const meaningfulUpdate = candidate.clusterVersion > 1;
  const additionalEvidencePoints = Math.min(
    Math.max(0, candidate.evidenceIndependenceCount - 1)
      * PERSONALIZATION_RULES.weights.additionalEvidenceUnit,
    PERSONALIZATION_RULES.weights.maximumAdditionalEvidence,
  );
  const score =
    (selectedCategory ? PERSONALIZATION_RULES.weights.selectedCategory : 0)
    + (customTopicMatches.length > 0 ? PERSONALIZATION_RULES.weights.customTopic : 0)
    + PERSONALIZATION_RULES.weights.geography[geography]
    + PERSONALIZATION_RULES.weights.evidence[candidate.evidenceStrength]
    + PERSONALIZATION_RULES.weights.source[candidate.sourceReliability]
    + PERSONALIZATION_RULES.weights.factualDepth[
      Math.max(0, Math.min(3, Math.trunc(candidate.factualDepth))) as 0 | 1 | 2 | 3
    ]
    + recency
    + (meaningfulUpdate ? PERSONALIZATION_RULES.weights.meaningfulUpdate : 0)
    + additionalEvidencePoints;

  return {
    ...candidate,
    score: Math.round(score * 1000) / 1000,
    subjectKey: subjectKey(candidate),
    reasons: {
      selectedCategory,
      customTopicMatches,
      geographicTier: geography,
      evidenceStrength: candidate.evidenceStrength,
      sourceReliability: candidate.sourceReliability,
      factualDepth: candidate.factualDepth,
      recencyPoints: recency,
      meaningfulUpdate,
      additionalEvidencePoints,
    },
  };
}

export function categoryCap(targetCount: number): number | null {
  if (targetCount <= 2) return null;
  if (targetCount <= 4) return 2;
  return Math.max(1, Math.floor(targetCount * 0.4));
}

function rerankForDiversity(
  candidates: ScoredCandidate[],
  context: PersonalizationContext,
): ScoredCandidate[] {
  const remaining = [...candidates];
  const selected: ScoredCandidate[] = [];
  const categoryCounts = new Map<NewsCategory, number>();
  const subjectCounts = new Map<string, number>();
  const targetCount = context.storyCount;
  const coverageRounds = Math.max(
    1,
    Math.floor(context.storyCount / Math.max(1, context.categories.length)),
  );

  // Coverage comes before global score: take the best available story from
  // every selected category for the requested rounds, then use score and
  // diversity only when a category does not have enough fresh stories.
  for (let round = 0; round < coverageRounds && selected.length < targetCount; round += 1) {
    for (const category of context.categories) {
      if (selected.length >= targetCount) break;
      const choices = remaining
        .filter((candidate) => candidate.category === category)
        .sort((left, right) => {
          const leftAdjusted = left.score
            - (subjectCounts.has(left.subjectKey) ? PERSONALIZATION_RULES.weights.repeatedSubjectPenalty : 0);
          const rightAdjusted = right.score
            - (subjectCounts.has(right.subjectKey) ? PERSONALIZATION_RULES.weights.repeatedSubjectPenalty : 0);
          return rightAdjusted - leftAdjusted
          || right.score - left.score
          || right.latestEventAt.localeCompare(left.latestEventAt)
          || left.clusterId.localeCompare(right.clusterId);
        });
      const chosen = choices[0];
      if (!chosen) continue;
      selected.push(chosen);
      categoryCounts.set(chosen.category, (categoryCounts.get(chosen.category) ?? 0) + 1);
      subjectCounts.set(chosen.subjectKey, (subjectCounts.get(chosen.subjectKey) ?? 0) + 1);
      remaining.splice(remaining.findIndex((candidate) => candidate.clusterId === chosen.clusterId), 1);
    }
  }

  const cap = context.categories.length === 1 ? null : categoryCap(targetCount);

  while (selected.length < targetCount && remaining.length > 0) {
    const withinCap = remaining.filter((candidate) =>
      cap === null || (categoryCounts.get(candidate.category) ?? 0) < cap,
    );
    const pool = withinCap.length > 0 ? withinCap : remaining;
    pool.sort((left, right) => {
      const leftAdjusted = left.score
        - (categoryCounts.get(left.category) ?? 0) * PERSONALIZATION_RULES.weights.repeatedCategoryPenalty
        - (subjectCounts.has(left.subjectKey) ? PERSONALIZATION_RULES.weights.repeatedSubjectPenalty : 0);
      const rightAdjusted = right.score
        - (categoryCounts.get(right.category) ?? 0) * PERSONALIZATION_RULES.weights.repeatedCategoryPenalty
        - (subjectCounts.has(right.subjectKey) ? PERSONALIZATION_RULES.weights.repeatedSubjectPenalty : 0);
      return rightAdjusted - leftAdjusted
        || right.score - left.score
        || right.latestEventAt.localeCompare(left.latestEventAt)
        || left.clusterId.localeCompare(right.clusterId);
    });
    const chosen = pool[0];
    selected.push(chosen);
    categoryCounts.set(chosen.category, (categoryCounts.get(chosen.category) ?? 0) + 1);
    subjectCounts.set(chosen.subjectKey, (subjectCounts.get(chosen.subjectKey) ?? 0) + 1);
    remaining.splice(remaining.findIndex((candidate) => candidate.clusterId === chosen.clusterId), 1);
  }
  return selected;
}

export function personalize(
  context: PersonalizationContext,
  candidates: PersonalizationCandidate[],
): PersonalizationDecision {
  const excluded = {
    alreadyDelivered: 0,
    centralTopic: 0,
    outsidePreferences: 0,
    belowQualityFloor: 0,
    localizationUnavailable: 0,
  };
  const available: ScoredCandidate[] = [];
  const localizationNeeded: ScoredCandidate[] = [];

  for (const candidate of candidates) {
    if (candidate.previousDeliveredVersion !== null
        && candidate.previousDeliveredVersion >= candidate.clusterVersion) {
      excluded.alreadyDelivered += 1;
      continue;
    }
    if (hasCentralExclusion(candidate, context.excludedTopics)) {
      excluded.centralTopic += 1;
      continue;
    }
    const selectedCategory = context.categories.includes(candidate.category);
    const customMatches = matchingCustomTopics(candidate, context.customTopics);
    if (!selectedCategory && customMatches.length === 0) {
      excluded.outsidePreferences += 1;
      continue;
    }
    const scored = scoreCandidate(context, candidate);
    if (!scored || scored.score < PERSONALIZATION_RULES.minimumScore) {
      excluded.belowQualityFloor += 1;
      continue;
    }
    if (!candidate.summaryAvailable || !candidate.summaryId) {
      excluded.localizationUnavailable += 1;
      if (context.language !== "en") localizationNeeded.push(scored);
      continue;
    }
    available.push(scored);
  }

  available.sort((left, right) => right.score - left.score
    || right.latestEventAt.localeCompare(left.latestEventAt)
    || left.clusterId.localeCompare(right.clusterId));
  localizationNeeded.sort((left, right) => right.score - left.score
    || right.latestEventAt.localeCompare(left.latestEventAt)
    || left.clusterId.localeCompare(right.clusterId));

  return {
    selected: rerankForDiversity(available, context),
    localizationNeeded: localizationNeeded.slice(
      0,
      Math.min(
        context.storyCount,
        PERSONALIZATION_RULES.maximumLocalizationQueuesPerDelivery,
      ),
    ),
    excluded,
  };
}
