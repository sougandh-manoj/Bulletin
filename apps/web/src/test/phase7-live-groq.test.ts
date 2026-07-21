import { describe, expect, it } from "vitest";

import { fetchFeed } from "@/lib/ingestion/fetch-feed";
import { normalizeDescription, normalizeWhitespace } from "@/lib/ingestion/normalize";
import { parseFeed } from "@/lib/ingestion/parse-feed";
import { deterministicGrounding } from "@/lib/intelligence/grounding";
import { GroqSummaryProvider } from "@/lib/intelligence/groq";
import { analyzeArticleLocally } from "@/lib/intelligence/local-analysis";
import { sharedSummaryPrompt } from "@/lib/intelligence/prompts";
import { sharedSummaryJsonSchema, sharedSummarySchema } from "@/lib/intelligence/schemas";

const live = process.env.RUN_PHASE7_LIVE_GROQ === "1";
const ARTICLE_ID = "public-article-1";
const PUBLISHER = "NASA";

describe.skipIf(!live)("Phase 7 live Groq public-news smoke test", () => {
  it("generates and locally grounds one briefing with exactly one Groq request", async () => {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error("GROQ_API_KEY is required for the explicitly enabled live smoke test");

    const fetched = await fetchFeed({
      feedUrl: "https://www.nasa.gov/news-release/feed/",
      allowedHosts: ["www.nasa.gov", "nasa.gov"],
      etag: null,
      lastModified: null,
    }, { timeoutMs: 20_000, attempts: 2 });
    if (fetched.outcome !== "success") throw new Error("NASA public feed unexpectedly returned not-modified");

    const parsed = parseFeed(fetched.body);
    const candidates = parsed.entries.flatMap((entry) => {
      const title = entry.title ? normalizeWhitespace(entry.title) : "";
      const description = normalizeDescription(entry.description);
      const combined = `${title} ${description ?? ""}`;
      const publishedValue = entry.published ?? entry.updated;
      const published = publishedValue ? new Date(publishedValue) : null;
      if (title.length < 20 || (description?.length ?? 0) < 140) return [];
      if (/(?:death|died|fatal|accident|disaster|emergency|war|attack|injur|lawsuit|court)/iu.test(combined)) return [];
      return [{
        title,
        description,
        canonicalUrl: entry.url ?? "https://www.nasa.gov/news-release/",
        publishedAt: published && !Number.isNaN(published.getTime()) ? published.toISOString() : new Date().toISOString(),
      }];
    });
    const article = candidates[0];
    if (!article) throw new Error("NASA public feed returned no suitable non-sensitive detailed article");

    const classification = analyzeArticleLocally({
      id: ARTICLE_ID,
      title: article.title,
      description: article.description,
      publishedAt: article.publishedAt,
      language: "en",
      countryCode: "US",
      stateRegion: null,
      city: null,
      feedCategories: ["science"],
    });
    expect(classification.status).toBe("ready");
    expect(classification.sensitiveFlags).toEqual([]);

    const evidence = [{
      sourceId: ARTICLE_ID,
      title: article.title,
      description: article.description,
      canonicalUrl: article.canonicalUrl,
      publishedAt: article.publishedAt,
      publisherName: PUBLISHER,
      publisherFamilyKey: "nasa.gov",
      language: "en",
      reliability: "tier-1",
      isInstitutional: true,
      classification,
      entities: classification.entities,
      eventType: classification.eventType,
      eventTime: classification.eventTime,
      keyAction: classification.keyAction,
      keyOutcome: classification.keyOutcome,
      importantNumbers: classification.importantNumbers,
    }];
    const prompt = sharedSummaryPrompt({
      clusterVersion: 1,
      isUpdate: false,
      isSensitive: false,
      evidenceStrength: "sufficient",
      evidencePolicy: { livePublicSmoke: true, independentEvidenceUnits: 1 },
      evidence,
    });

    let generationCalls = 0;
    const provider = new GroqSummaryProvider({
      apiKey,
      generationModel: process.env.GROQ_GENERATION_MODEL ?? "openai/gpt-oss-20b",
      timeoutMs: 30_000,
      maxAttempts: 1,
      fetchImplementation: async (...args) => {
        generationCalls += 1;
        return fetch(...args);
      },
    });
    const output = sharedSummarySchema.parse(await provider.generateStructured({
      task: "summarization",
      prompt,
      schemaName: "bulletin_shared_summary_v1",
      jsonSchema: sharedSummaryJsonSchema as unknown as Record<string, unknown>,
    }));
    expect(generationCalls).toBe(1);
    expect(output.status).toBe("ready");

    const grounding = deterministicGrounding(output, [{
      id: ARTICLE_ID,
      publisherName: PUBLISHER,
      title: article.title,
      description: article.description,
    }], undefined, false);
    expect(grounding).toMatchObject({ passed: true, reasonCodes: [] });

    console.log("PHASE7_LIVE_GROQ_BRIEFING=" + JSON.stringify({
      sourceArticle: {
        title: article.title,
        publisher: PUBLISHER,
        publishedAt: article.publishedAt,
        url: article.canonicalUrl,
      },
      output,
      grounding,
      provider: provider.name,
      model: provider.generationModel,
      generationCalls,
    }));
  }, 60_000);
});
