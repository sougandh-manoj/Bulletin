import { describe, expect, it } from "vitest";

import { findSameSourceDuplicate, titleDiceSimilarity } from "@/lib/ingestion/dedupe";
import { stableHash } from "@/lib/ingestion/normalize";
import type { NormalizedArticle } from "@/lib/ingestion/types";

function article(overrides: Partial<NormalizedArticle> = {}): NormalizedArticle {
  const normalizedTitle = overrides.normalizedTitle ?? "india central bank keeps policy rate unchanged after committee meeting today";
  return {
    sourceId: "source-1",
    publisherName: "Publisher",
    originalTitle: normalizedTitle,
    normalizedTitle,
    originalUrl: "https://example.com/story",
    canonicalUrl: "https://example.com/story",
    canonicalUrlHash: stableHash("https://example.com/story"),
    normalizedTitleHash: overrides.normalizedTitleHash ?? stableHash(normalizedTitle),
    description: null,
    author: null,
    publishedAt: "2026-07-18T05:00:00Z",
    feedUpdatedAt: null,
    timestampSource: "published",
    declaredLanguage: "en",
    languageSource: "source",
    countryCode: "IN",
    stateRegion: null,
    city: null,
    geographySource: "source",
    feedCategories: [],
    feedEntryId: null,
    rawMetadata: {},
    normalizationVersion: "phase-6-v1",
    ...overrides,
  };
}

describe("bounded same-source duplicate handling", () => {
  it("matches exact normalized titles within 72 hours", () => {
    const input = article();
    expect(findSameSourceDuplicate(input, [{
      id: "existing",
      sourceId: input.sourceId,
      normalizedTitle: input.normalizedTitle,
      normalizedTitleHash: input.normalizedTitleHash,
      publishedAt: "2026-07-16T06:00:00Z",
    }])).toEqual({ kind: "same-source-title", articleId: "existing" });
  });

  it("uses a strict high-similarity window for non-identical titles", () => {
    const input = article({
      normalizedTitle: "india central bank keeps policy rate unchanged after committee meeting in mumbai again today",
    });
    const candidateTitle = "india central bank keeps policy rate unchanged after committee meeting in mumbai again now";
    expect(titleDiceSimilarity(input.normalizedTitle, candidateTitle)).toBeGreaterThanOrEqual(0.92);
    expect(findSameSourceDuplicate(input, [{
      id: "near",
      sourceId: input.sourceId,
      normalizedTitle: candidateTitle,
      normalizedTitleHash: stableHash(candidateTitle),
      publishedAt: "2026-07-18T02:00:00Z",
    }])).toEqual({ kind: "same-source-near-title", articleId: "near" });
  });

  it("never crosses sources, six-hour near windows, or differing numeric facts", () => {
    const input = article({
      normalizedTitle: "india central bank keeps policy rate at 5 percent after committee meeting today",
    });
    const candidate = {
      id: "candidate",
      sourceId: "source-2",
      normalizedTitle: "india central bank keeps policy rate at 5 percent after committee meeting now",
      normalizedTitleHash: stableHash("different"),
      publishedAt: "2026-07-18T04:00:00Z",
    };
    expect(findSameSourceDuplicate(input, [candidate])).toBeNull();
    expect(findSameSourceDuplicate(input, [{ ...candidate, sourceId: input.sourceId, publishedAt: "2026-07-17T20:59:59Z" }])).toBeNull();
    expect(findSameSourceDuplicate(input, [{ ...candidate, sourceId: input.sourceId, normalizedTitle: candidate.normalizedTitle.replace("5", "6") }])).toBeNull();
  });

  it("does not near-match short headlines even when their wording is close", () => {
    const input = article({ normalizedTitle: "bank keeps rate unchanged today" });
    expect(findSameSourceDuplicate(input, [{
      id: "short",
      sourceId: input.sourceId,
      normalizedTitle: "bank keeps rate unchanged now",
      normalizedTitleHash: stableHash("bank keeps rate unchanged now"),
      publishedAt: "2026-07-18T04:00:00Z",
    }])).toBeNull();
  });
});

