import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { getTrustedSupabase } from "@/lib/supabase/server";
import { fetchFeed } from "@/lib/ingestion/fetch-feed";
import { normalizeArticleEntry } from "@/lib/ingestion/normalize";
import { parseFeed } from "@/lib/ingestion/parse-feed";
import { GeminiSummaryProvider } from "@/lib/intelligence/gemini";
import {
  IntelligenceProviderError,
  type StorySummaryProvider,
} from "@/lib/intelligence/provider";
import {
  localizedSummarySchema,
  sharedSummarySchema,
} from "@/lib/intelligence/schemas";
import { runIntelligenceBatch } from "@/services/intelligence";
import { runSharedSummaryBatch, type SummaryQuotaConfiguration } from "@/services/shared-summaries";

const live = process.env.RUN_PHASE7_LIVE_GEMINI_REGRESSION === "1";
const ARTICLE_TARGET = Number.parseInt(process.env.PHASE7_LIVE_ARTICLE_TARGET ?? "20", 10);
const GENERATION_HTTP_CAP = Math.min(
  18,
  Number.parseInt(process.env.PHASE7_LIVE_GENERATION_HTTP_CAP ?? "18", 10),
);
const GENERATION_SPACING_MS = 15_500;

const SOURCE_KEYS = [
  "nasa-news-releases",
  "gadgets-360-latest",
  "tech-xplore-ai-machine-learning",
  "phys-org-science-technology",
  "mongabay-india-climate",
  "carbon-brief-latest",
  "india-today-sports",
  "news18-malayalam-sports",
  "ndtv-hindi-business",
  "who-news-english",
  "bbc-world",
] as const;

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

type NormalizedArticle = Extract<ReturnType<typeof normalizeArticleEntry>, { ok: true }>["article"];
type ArticleCandidate = { source: SourceRow; article: NormalizedArticle };

const generationQuota: SummaryQuotaConfiguration = {
  requestsPerMinute: 4,
  unitsPerMinute: 200_000,
  requestsPerDay: 18,
  unitsPerDay: 1_000_000,
};

function increment(counter: Record<string, number>, key: string): void {
  counter[key] = (counter[key] ?? 0) + 1;
}

describe.skipIf(!live)("Phase 7 live Gemini representative regression", () => {
  it("processes current public-news articles with Flash-Lite", async () => {
    const startedAt = Date.now();
    const databaseUrl = new URL(process.env.SUPABASE_URL ?? "https://invalid.example");
    if (!["127.0.0.1", "localhost"].includes(databaseUrl.hostname)) {
      throw new Error("Live Gemini regression refuses non-local Supabase URLs");
    }
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is required for the explicitly enabled live regression");
    const generationModel = process.env.GEMINI_GENERATION_MODEL;
    if (!Number.isInteger(ARTICLE_TARGET) || ARTICLE_TARGET < 1 || ARTICLE_TARGET > 20) {
      throw new Error("PHASE7_LIVE_ARTICLE_TARGET must be an integer from 1 to 20");
    }
    if (generationModel !== "gemini-3.1-flash-lite") {
      throw new Error("Live regression requires GEMINI_GENERATION_MODEL=gemini-3.1-flash-lite");
    }

    const database = getTrustedSupabase();
    const { count: pendingCount, error: pendingError } = await database.from("articles")
      .select("id", { count: "exact", head: true })
      .in("processing_status", ["pending", "retry-wait", "claimed"]);
    if (pendingError) throw pendingError;
    if ((pendingCount ?? 0) > 0) {
      throw new Error("Live regression refuses to claim unrelated pending local articles");
    }

    const { data: sourceData, error: sourceError } = await database.from("sources")
      .select("id, catalogue_key, publisher_name, feed_url, allowed_hosts, language, country_code, state_region, category_scope")
      .in("catalogue_key", [...SOURCE_KEYS])
      .eq("is_active", true)
      .eq("terms_status", "approved")
      .eq("technical_status", "verified");
    if (sourceError) throw sourceError;
    const sourceOrder = new Map<string, number>(SOURCE_KEYS.map((key, index) => [key, index]));
    const sources = (sourceData as SourceRow[]).sort((left, right) =>
      (sourceOrder.get(left.catalogue_key) ?? SOURCE_KEYS.length)
      - (sourceOrder.get(right.catalogue_key) ?? SOURCE_KEYS.length),
    );
    if (sources.length < 8) throw new Error("Too few approved public sources are available for a representative run");

    const now = new Date();
    const feedResults = await Promise.all(sources.map(async (source) => {
      try {
        const fetched = await fetchFeed({
          feedUrl: source.feed_url,
          allowedHosts: source.allowed_hosts,
          etag: null,
          lastModified: null,
        }, { timeoutMs: 20_000, attempts: 2, now: () => now });
        if (fetched.outcome !== "success") return { source, candidates: [] as ArticleCandidate[], error: "not-modified" };
        const parsed = parseFeed(fetched.body);
        const candidates = parsed.entries.flatMap((entry) => {
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
          return result.ok && (result.article.description?.length ?? 0) >= 100
            ? [{ source, article: result.article }]
            : [];
        }).sort((left, right) => right.article.publishedAt.localeCompare(left.article.publishedAt));
        return { source, candidates, error: null };
      } catch (error) {
        return { source, candidates: [] as ArticleCandidate[], error: error instanceof Error ? error.name : "unknown" };
      }
    }));

    const { data: existingArticleData, error: existingArticleError } = await database.from("articles")
      .select("canonical_url");
    if (existingArticleError) throw existingArticleError;
    const existingUrls = new Set((existingArticleData ?? []).map((article) => article.canonical_url));
    const maximumFeedDepth = Math.max(...feedResults.map((result) => result.candidates.length));
    const roundRobinCandidates: ArticleCandidate[] = [];
    for (let depth = 0; depth < maximumFeedDepth; depth += 1) {
      for (const result of feedResults) {
        const candidate = result.candidates[depth];
        if (candidate && !existingUrls.has(candidate.article.canonicalUrl)) roundRobinCandidates.push(candidate);
      }
    }
    const uniqueCandidates = roundRobinCandidates.filter((candidate, index, values) =>
      values.findIndex((value) => value.article.canonicalUrlHash === candidate.article.canonicalUrlHash) === index,
    );
    console.log("PHASE7_REGRESSION_FEEDS=" + JSON.stringify({
      requested: sources.length,
      successful: feedResults.filter((result) => result.candidates.length > 0).length,
      failed: feedResults.filter((result) => result.error).map((result) => ({
        source: result.source.catalogue_key,
        error: result.error,
      })),
      candidateCount: uniqueCandidates.length,
    }));
    if (uniqueCandidates.length < ARTICLE_TARGET) {
      throw new Error(`Only ${uniqueCandidates.length} suitable current public articles were available`);
    }

    const regressionId = randomUUID();
    const inserted: Array<{ id: string; source: SourceRow; article: NormalizedArticle }> = [];
    for (const candidate of uniqueCandidates) {
      if (inserted.length >= ARTICLE_TARGET) break;
      const id = randomUUID();
      const { error } = await database.from("articles").insert({
        id,
        source_id: candidate.source.id,
        original_title: candidate.article.originalTitle,
        normalized_title: candidate.article.normalizedTitle,
        description: candidate.article.description,
        canonical_url: candidate.article.canonicalUrl,
        canonical_url_hash: `\\x${candidate.article.canonicalUrlHash}`,
        normalized_title_hash: `\\x${candidate.article.normalizedTitleHash}`,
        author: candidate.article.author,
        published_at: candidate.article.publishedAt,
        declared_language: candidate.article.declaredLanguage,
        country_code: candidate.article.countryCode,
        state_region: candidate.article.stateRegion,
        city: candidate.article.city,
        feed_categories: candidate.article.feedCategories,
        raw_metadata: {
          liveRegressionId: regressionId,
          feedEntryId: candidate.article.feedEntryId,
          catalogueKey: candidate.source.catalogue_key,
        },
        next_processing_at: new Date(now.getTime() - 60_000).toISOString(),
      });
      if (error?.code === "23505") continue;
      if (error) throw error;
      inserted.push({ id, source: candidate.source, article: candidate.article });
    }
    if (inserted.length !== ARTICLE_TARGET) {
      throw new Error(`Inserted ${inserted.length} unique articles instead of ${ARTICLE_TARGET}`);
    }
    console.log("PHASE7_REGRESSION_INSERTED=" + JSON.stringify({
      regressionId,
      count: inserted.length,
      languages: inserted.reduce<Record<string, number>>((counts, item) => {
        increment(counts, item.article.declaredLanguage);
        return counts;
      }, {}),
      sources: [...new Set(inserted.map((item) => item.source.publisher_name))],
    }));

    const httpAttempts: Record<string, number> = {};
    const httpStatuses: Record<string, number> = {};
    const taskInvocations: Record<string, number> = {};
    const taskSchemaFailures: Record<string, number> = {};
    const taskErrors: Record<string, number> = {};
    let nextGenerationAt = 0;
    const instrumentedFetch: typeof fetch = async (request, init) => {
      const requestUrl = new URL(typeof request === "string"
        ? request
        : request instanceof URL
          ? request.href
          : request.url);
      if (!requestUrl.pathname.endsWith("/interactions")) {
        throw new IntelligenceProviderError("live-regression-non-summary-call", "Only summary generation is allowed", false);
      }
      const endpoint = "generation";
      if ((httpAttempts[endpoint] ?? 0) >= GENERATION_HTTP_CAP) {
        throw new IntelligenceProviderError("live-regression-generation-cap", "Live generation request cap reached", false);
      }
      const waitMs = Math.max(0, nextGenerationAt - Date.now());
      if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
      nextGenerationAt = Date.now() + GENERATION_SPACING_MS;
      increment(httpAttempts, endpoint);
      const response = await fetch(request, init);
      increment(httpStatuses, `${endpoint}:${response.status}`);
      if (endpoint === "generation" && (httpAttempts.generation ?? 0) % 5 === 0) {
        console.log("PHASE7_REGRESSION_PROGRESS=" + JSON.stringify({
          generationHttpAttempts: httpAttempts.generation,
          elapsedSeconds: Math.round((Date.now() - startedAt) / 1_000),
        }));
      }
      return response;
    };

    const gemini = new GeminiSummaryProvider({
      apiKey,
      generationModel,
      timeoutMs: 30_000,
      maxAttempts: 2,
      fetchImplementation: instrumentedFetch,
    });
    const provider: StorySummaryProvider = {
      name: gemini.name,
      generationModel: gemini.generationModel,
      generateStructured: async (request) => {
        increment(taskInvocations, request.task);
        try {
          const output = await gemini.generateStructured(request);
          const schema = request.task === "summarization"
            ? sharedSummarySchema
            : request.task === "localization"
              ? localizedSummarySchema
              : null;
          if (!schema) throw new Error(`Unexpected generative task in summary-only regression: ${request.task}`);
          const schemaResult = schema.safeParse(output);
          if (!schemaResult.success) {
            increment(taskSchemaFailures, request.task);
            console.log("PHASE7_REGRESSION_SCHEMA_ISSUES=" + JSON.stringify({
              task: request.task,
              issues: schemaResult.error.issues.map((issue) => ({
                path: issue.path.join("."),
                code: issue.code,
              })),
            }));
          }
          return output;
        } catch (error) {
          increment(taskErrors, error instanceof IntelligenceProviderError ? error.code : "unknown");
          throw error;
        }
      },
    };

    const intelligence = await runIntelligenceBatch({
      batchSize: ARTICLE_TARGET,
      leaseSeconds: 900,
    });
    console.log("PHASE7_REGRESSION_INTELLIGENCE=" + JSON.stringify(intelligence));
    const summaries = await runSharedSummaryBatch({
      provider,
      quota: generationQuota,
      batchSize: ARTICLE_TARGET,
      leaseSeconds: 900,
    });

    const articleIds = inserted.map((item) => item.id);
    const { data: articleRows, error: articleError } = await database.from("articles")
      .select("id, original_title, processing_status, last_error_code, classification, is_sensitive, factual_depth")
      .in("id", articleIds)
      .order("published_at", { ascending: false });
    if (articleError) throw articleError;
    const { data: relationRows, error: relationError } = await database.from("story_cluster_articles")
      .select("article_id, cluster_id")
      .in("article_id", articleIds);
    if (relationError) throw relationError;
    const clusterIds = [...new Set((relationRows ?? []).map((row) => row.cluster_id))];
    const { data: summaryRows, error: summaryError } = clusterIds.length === 0
      ? { data: [], error: null }
      : await database.from("cluster_summaries")
        .select("cluster_id, status, headline, summary, why_it_matters, source_references, attribution_markers, verification_result, provider, model, repair_attempted, last_error_code")
        .in("cluster_id", clusterIds)
        .eq("language", "en")
        .order("created_at", { ascending: false });
    if (summaryError) throw summaryError;

    const articleSource = new Map(inserted.map((item) => [item.id, item.source.publisher_name]));
    const categories: Record<string, number> = {};
    const articleStatuses: Record<string, number> = {};
    for (const row of articleRows ?? []) {
      increment(articleStatuses, row.processing_status);
      const classification = row.classification as { category?: unknown } | null;
      increment(categories, typeof classification?.category === "string" ? classification.category : "unclassified");
    }
    const summaryStatuses: Record<string, number> = {};
    for (const row of summaryRows ?? []) increment(summaryStatuses, row.status);
    const relationByCluster = new Map((relationRows ?? []).map((row) => [row.cluster_id, row.article_id]));
    const briefingSamples = (summaryRows ?? []).filter((row) => row.status === "verified").slice(0, 5).map((row) => ({
      publisher: articleSource.get(relationByCluster.get(row.cluster_id) ?? "") ?? "multiple sources",
      headline: row.headline,
      summary: row.summary,
      whyItMatters: row.why_it_matters,
      model: row.model,
      repaired: row.repair_attempted,
    }));
    const result = {
      regressionId,
      model: generationModel,
      articles: {
        inserted: inserted.length,
        statuses: articleStatuses,
        categories,
        sensitive: (articleRows ?? []).filter((row) => row.is_sensitive).length,
      },
      workers: { intelligence, summaries },
      provider: { httpAttempts, httpStatuses, taskInvocations, taskSchemaFailures, taskErrors },
      summaryStatuses,
      briefingSamples,
      elapsedSeconds: Math.round((Date.now() - startedAt) / 1_000),
    };
    console.log("PHASE7_REGRESSION_RESULT=" + JSON.stringify(result));

    expect(intelligence.claimed).toBe(ARTICLE_TARGET);
    expect(intelligence.failed).toBe(0);
    expect(intelligence.retrying).toBe(0);
    expect(intelligence.processed).toBeGreaterThanOrEqual(Math.ceil(ARTICLE_TARGET * 0.8));
    expect(taskInvocations.classification ?? 0).toBe(0);
    expect(taskInvocations["cluster-verification"] ?? 0).toBe(0);
    expect(taskInvocations["final-verification"] ?? 0).toBe(0);
    expect(Object.values(taskSchemaFailures).reduce((sum, count) => sum + count, 0)).toBe(0);
    expect(summaries.failed).toBe(0);
    expect(summaries.retrying).toBe(0);
    expect(taskInvocations.summarization ?? 0).toBe(summaries.claimed);
    expect(summaries.verified + summaries.insufficientEvidence + summaries.conflictingEvidence).toBe(summaries.claimed);
  }, 900_000);
});
