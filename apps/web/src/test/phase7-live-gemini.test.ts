import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { getTrustedSupabase } from "@/lib/supabase/server";
import { fetchFeed } from "@/lib/ingestion/fetch-feed";
import { normalizeArticleEntry } from "@/lib/ingestion/normalize";
import { parseFeed } from "@/lib/ingestion/parse-feed";
import { GeminiSummaryProvider } from "@/lib/intelligence/gemini";
import type { StorySummaryProvider } from "@/lib/intelligence/provider";
import { sharedSummarySchema } from "@/lib/intelligence/schemas";
import { runIntelligenceBatch } from "@/services/intelligence";
import { runSharedSummaryBatch, type SummaryQuotaConfiguration } from "@/services/shared-summaries";

const live = process.env.RUN_PHASE7_LIVE_GEMINI === "1";

type SourceRow = {
  id: string;
  catalogue_key: string;
  publisher_name: string;
  feed_url: string;
  allowed_hosts: string[];
  language: "en" | "hi" | "ml";
  country_code: string | null;
  state_region: string | null;
  category_scope: string[] | null;
};

const quota: SummaryQuotaConfiguration = {
  requestsPerMinute: 8,
  unitsPerMinute: 100_000,
  requestsPerDay: 8,
  unitsPerDay: 200_000,
};

describe.skipIf(!live)("Phase 7 live Gemini public-news smoke test", () => {
  it("creates one verified briefing from a real approved institutional feed", async () => {
    const databaseUrl = new URL(process.env.SUPABASE_URL ?? "https://invalid.example");
    if (!["127.0.0.1", "localhost"].includes(databaseUrl.hostname)) {
      throw new Error("Phase 7 live smoke test refuses non-local Supabase URLs");
    }
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is required for the explicitly enabled live smoke test");

    const database = getTrustedSupabase();
    const { count, error: countError } = await database.from("articles").select("id", { count: "exact", head: true });
    if (countError) throw countError;
    if (count !== 0) throw new Error("Phase 7 live smoke test requires an empty local articles table");

    const { data: sourceData, error: sourceError } = await database.from("sources")
      .select("id, catalogue_key, publisher_name, feed_url, allowed_hosts, language, country_code, state_region, category_scope")
      .eq("catalogue_key", "nasa-news-releases").eq("is_active", true).eq("terms_status", "approved").single();
    if (sourceError) throw sourceError;
    const source = sourceData as SourceRow;
    const now = new Date();
    const fetched = await fetchFeed({
      feedUrl: source.feed_url,
      allowedHosts: source.allowed_hosts,
      etag: null,
      lastModified: null,
    }, { timeoutMs: 20_000, attempts: 2, now: () => now });
    if (fetched.outcome !== "success") throw new Error("Live public feed unexpectedly returned not-modified");
    const parsed = parseFeed(fetched.body);
    const normalized = parsed.entries.flatMap((entry) => {
      const result = normalizeArticleEntry({
        entry,
        feedLanguage: parsed.language,
        source: {
          id: source.id,
          publisherName: source.publisher_name,
          language: source.language,
          countryCode: source.country_code,
          stateRegion: source.state_region,
          categoryScope: source.category_scope ?? [],
        },
        now,
      });
      return result.ok ? [result.article] : [];
    });
    const safeCandidates = normalized.filter((article) => {
      const text = `${article.originalTitle} ${article.description ?? ""}`;
      return (article.description?.length ?? 0) >= 160
        && !/\b(?:death|died|fatal|accident|disaster|emergency|war|attack|injur|lawsuit|court)\b/i.test(text);
    }).sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));
    const article = safeCandidates[0] ?? normalized.sort((left, right) => right.publishedAt.localeCompare(left.publishedAt))[0];
    if (!article) throw new Error("Approved live feed returned no normalizable recent article");

    const articleId = randomUUID();
    const { error: insertError } = await database.from("articles").insert({
      id: articleId,
      source_id: source.id,
      original_title: article.originalTitle,
      normalized_title: article.normalizedTitle,
      description: article.description,
      canonical_url: article.canonicalUrl,
      canonical_url_hash: `\\x${article.canonicalUrlHash}`,
      normalized_title_hash: `\\x${article.normalizedTitleHash}`,
      author: article.author,
      published_at: article.publishedAt,
      declared_language: article.declaredLanguage,
      country_code: article.countryCode,
      state_region: article.stateRegion,
      city: article.city,
      feed_categories: article.feedCategories,
      raw_metadata: { livePublicSmoke: true, feedEntryId: article.feedEntryId },
      next_processing_at: new Date(now.getTime() - 60_000).toISOString(),
    });
    if (insertError) throw insertError;

    const gemini = new GeminiSummaryProvider({
      apiKey,
      generationModel: process.env.GEMINI_GENERATION_MODEL ?? "gemini-3.1-flash-lite",
      timeoutMs: 30_000,
      maxAttempts: 2,
    });
    const provider: StorySummaryProvider = {
      name: gemini.name,
      generationModel: gemini.generationModel,
      generateStructured: async (request) => {
        const output = await gemini.generateStructured(request);
        const schema = request.task === "summarization" ? sharedSummarySchema : null;
        const result = schema?.safeParse(output);
        if (result && !result.success) {
          console.log("PHASE7_LIVE_SCHEMA_ISSUES=" + JSON.stringify({
            task: request.task,
            issues: result.error.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code })),
          }));
        }
        return output;
      },
    };
    const intelligence = await runIntelligenceBatch({ batchSize: 1, leaseSeconds: 300 });
    expect(intelligence).toMatchObject({ claimed: 1, processed: 1, failed: 0, summariesQueued: 1 });
    const summaries = await runSharedSummaryBatch({ provider, quota, batchSize: 1, leaseSeconds: 420 });

    const { data: relation, error: relationError } = await database.from("story_cluster_articles")
      .select("cluster_id").eq("article_id", articleId).single();
    if (relationError) throw relationError;
    const { data: summary, error: summaryError } = await database.from("cluster_summaries")
      .select("status, headline, summary, why_it_matters, source_references, attribution_markers, verification_result, provider, model")
      .eq("cluster_id", relation.cluster_id).eq("language", "en").single();
    if (summaryError) throw summaryError;

    console.log("PHASE7_LIVE_BRIEFING=" + JSON.stringify({
      sourceArticle: {
        title: article.originalTitle,
        publisher: source.publisher_name,
        publishedAt: article.publishedAt,
        url: article.canonicalUrl,
      },
      workerResults: { intelligence, summaries },
      briefing: summary,
    }));
    expect(summaries).toMatchObject({ claimed: 1, verified: 1, failed: 0 });
    expect(summary.status).toBe("verified");
  }, 180_000);
});
