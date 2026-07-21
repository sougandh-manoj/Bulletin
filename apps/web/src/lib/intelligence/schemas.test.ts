import { describe, expect, it } from "vitest";

import { classificationSchema, sharedSummarySchema } from "@/lib/intelligence/schemas";

describe("strict intelligence schemas", () => {
  it("rejects unknown classification fields and malformed geography", () => {
    const fixture = {
      status: "ready", category: "india", topics: ["policy"], entities: { people: [], organizations: [], locations: [] },
      geography: { countryCode: "IND", stateRegion: null, city: null }, eventTime: null, eventType: "announcement",
      keyAction: null, keyOutcome: null, importantNumbers: [], sensitiveFlags: [], factualDepth: 2,
      sourceIds: ["article-1"], uncertaintyMarkers: [], injected: "ignored?",
    };
    expect(classificationSchema.safeParse(fixture).success).toBe(false);
  });

  it("rejects duplicate or empty summary citations", () => {
    const fixture = {
      status: "ready", headline: "Headline", summary: "Sentence one. Sentence two. Sentence three.", whyItMatters: "Impact.",
      citationArticleIds: ["article-1", "article-1"], attributionMarkers: [], uncertaintyMarkers: [], isUpdate: false,
    };
    expect(sharedSummarySchema.safeParse(fixture).success).toBe(false);
  });
});
