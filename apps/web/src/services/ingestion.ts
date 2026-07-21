import "server-only";

import { randomUUID } from "node:crypto";

import {
  claimDueSources,
  completeSourceIngestion,
  IngestionDataError,
  insertIngestedArticles,
  listDuplicateCandidates,
  recordIngestionHeartbeat,
  type ArticleInsert,
  type ClaimedSource,
} from "@/data/ingestion";
import {
  findSameSourceDuplicate,
  type DuplicateCandidate,
} from "@/lib/ingestion/dedupe";
import {
  DEFAULT_FEED_MAX_BYTES,
  DEFAULT_FEED_TIMEOUT_MS,
  FeedFetchError,
  fetchFeed,
  type FeedFetchResult,
} from "@/lib/ingestion/fetch-feed";
import { normalizeArticleEntry } from "@/lib/ingestion/normalize";
import {
  FEED_PARSER_VERSION,
  FeedParseError,
  parseFeed,
} from "@/lib/ingestion/parse-feed";
import type { NormalizedArticle } from "@/lib/ingestion/types";
import { createLogger } from "@/lib/logging/logger";

const logger = createLogger("rss-ingestion");
const FAILURE_BACKOFF_MS = [5, 15, 60, 360].map((minutes) => minutes * 60 * 1000);
const DUPLICATE_LOOKBACK_MS = 72 * 60 * 60 * 1000;

type IngestionDependencies = {
  claim: typeof claimDueSources;
  complete: typeof completeSourceIngestion;
  candidates: typeof listDuplicateCandidates;
  insert: typeof insertIngestedArticles;
  heartbeat: typeof recordIngestionHeartbeat;
  fetch: (
    source: { feedUrl: string; allowedHosts: string[]; etag: string | null; lastModified: string | null },
    options: { timeoutMs: number; maxBytes: number; now: () => Date },
  ) => Promise<FeedFetchResult>;
};

const defaultDependencies: IngestionDependencies = {
  claim: claimDueSources,
  complete: completeSourceIngestion,
  candidates: listDuplicateCandidates,
  insert: insertIngestedArticles,
  heartbeat: recordIngestionHeartbeat,
  fetch: (source, options) => fetchFeed(source, options),
};

export type IngestionBatchResult = {
  workerId: string;
  claimed: number;
  succeeded: number;
  notModified: number;
  failed: number;
  parsedEntries: number;
  rejectedEntries: number;
  insertedArticles: number;
  exactDuplicates: number;
  nearDuplicates: number;
};

function errorCode(error: unknown): string {
  if (error instanceof FeedFetchError) return error.code;
  if (error instanceof FeedParseError) return `parse-${error.code}`;
  if (error instanceof IngestionDataError) return "database-error";
  return "unexpected-ingestion-error";
}

function failureNextFetch(source: ClaimedSource, error: unknown, at: Date): Date {
  const index = Math.min(source.consecutiveFailures, FAILURE_BACKOFF_MS.length - 1);
  const backoff = new Date(at.getTime() + FAILURE_BACKOFF_MS[index]);
  if (error instanceof FeedFetchError && error.retryAt && error.retryAt > backoff) {
    return error.retryAt;
  }
  return backoff;
}

function candidateWindow(articles: NormalizedArticle[]): { from: Date; to: Date } | null {
  if (articles.length === 0) return null;
  const timestamps = articles.map((article) => Date.parse(article.publishedAt));
  return {
    from: new Date(Math.min(...timestamps) - DUPLICATE_LOOKBACK_MS),
    to: new Date(Math.max(...timestamps) + DUPLICATE_LOOKBACK_MS),
  };
}

async function ingestSource(input: {
  source: ClaimedSource;
  dependencies: IngestionDependencies;
  now: () => Date;
  timeoutMs: number;
  maxBytes: number;
}): Promise<{
  outcome: "success" | "not-modified" | "failure";
  parsedEntries: number;
  rejectedEntries: number;
  insertedArticles: number;
  exactDuplicates: number;
  nearDuplicates: number;
}> {
  const { source, dependencies, now } = input;
  let fetchResult: FeedFetchResult | null = null;
  try {
    fetchResult = await dependencies.fetch({
      feedUrl: source.feedUrl,
      allowedHosts: source.allowedHosts,
      etag: source.etag,
      lastModified: source.lastModified,
    }, {
      timeoutMs: input.timeoutMs,
      maxBytes: input.maxBytes,
      now,
    });

    const completedAt = now();
    if (fetchResult.outcome === "not-modified") {
      const completed = await dependencies.complete({
        sourceId: source.id,
        leaseToken: source.leaseToken,
        outcome: "not-modified",
        nextFetchAt: new Date(completedAt.getTime() + source.expectedUpdateIntervalMs),
        httpStatus: 304,
        etag: fetchResult.etag,
        lastModified: fetchResult.lastModified,
        responseBytes: 0,
        effectiveUrl: fetchResult.effectiveUrl,
        articleCount: 0,
        duplicateCount: 0,
        errorCode: null,
        retryAfterAt: null,
        parserVersion: null,
        now: completedAt,
      });
      if (!completed) throw new IngestionDataError("source-lease-lost");
      return { outcome: "not-modified", parsedEntries: 0, rejectedEntries: 0, insertedArticles: 0, exactDuplicates: 0, nearDuplicates: 0 };
    }

    const parsed = parseFeed(fetchResult.body);
    const normalized: NormalizedArticle[] = [];
    let rejectedEntries = 0;
    for (const entry of parsed.entries) {
      const result = normalizeArticleEntry({
        entry,
        feedLanguage: parsed.language,
        source: {
          id: source.id,
          publisherName: source.publisherName,
          language: source.language,
          countryCode: source.countryCode,
          stateRegion: source.stateRegion,
          categoryScope: source.categoryScope,
        },
        now: completedAt,
      });
      if (result.ok) normalized.push(result.article);
      else rejectedEntries += 1;
    }

    normalized.sort((left, right) =>
      left.publishedAt.localeCompare(right.publishedAt)
      || left.canonicalUrl.localeCompare(right.canonicalUrl, "en")
      || left.normalizedTitle.localeCompare(right.normalizedTitle, "und"),
    );

    const window = candidateWindow(normalized);
    const candidates = window
      ? await dependencies.candidates({
          sourceId: source.id,
          publishedFrom: window.from,
          publishedTo: window.to,
        })
      : [];
    const feedCandidates: DuplicateCandidate[] = [];
    const seenCanonicalUrls = new Set<string>();
    const inserts: ArticleInsert[] = [];
    let feedExactDuplicates = 0;
    let feedNearDuplicates = 0;

    for (const article of normalized) {
      if (seenCanonicalUrls.has(article.canonicalUrl)) {
        feedExactDuplicates += 1;
        continue;
      }
      seenCanonicalUrls.add(article.canonicalUrl);
      const storedDuplicate = findSameSourceDuplicate(article, candidates);
      const feedDuplicate = storedDuplicate
        ? null
        : findSameSourceDuplicate(article, feedCandidates);
      if (feedDuplicate) {
        feedNearDuplicates += 1;
        continue;
      }
      const id = randomUUID();
      inserts.push({
        ...article,
        id,
        duplicateOfArticleId: storedDuplicate?.articleId ?? null,
        duplicateKind: storedDuplicate?.kind ?? null,
      });
      if (!storedDuplicate) {
        feedCandidates.push({
          id,
          sourceId: article.sourceId,
          normalizedTitle: article.normalizedTitle,
          normalizedTitleHash: article.normalizedTitleHash,
          publishedAt: article.publishedAt,
        });
      }
    }

    const inserted = await dependencies.insert({
      sourceId: source.id,
      leaseToken: source.leaseToken,
      articles: inserts,
      now: completedAt,
    });
    const exactDuplicates = feedExactDuplicates + inserted.exactDuplicates;
    const nearDuplicates = feedNearDuplicates + inserted.nearDuplicates;
    const duplicateCount = exactDuplicates + nearDuplicates;
    const completed = await dependencies.complete({
      sourceId: source.id,
      leaseToken: source.leaseToken,
      outcome: "success",
      nextFetchAt: new Date(completedAt.getTime() + source.expectedUpdateIntervalMs),
      httpStatus: fetchResult.status,
      etag: fetchResult.etag,
      lastModified: fetchResult.lastModified,
      responseBytes: fetchResult.responseBytes,
      effectiveUrl: fetchResult.effectiveUrl,
      articleCount: inserted.inserted,
      duplicateCount,
      errorCode: null,
      retryAfterAt: null,
      parserVersion: FEED_PARSER_VERSION,
      now: completedAt,
    });
    if (!completed) throw new IngestionDataError("source-lease-lost");

    return {
      outcome: "success",
      parsedEntries: parsed.entries.length,
      rejectedEntries,
      insertedArticles: inserted.inserted,
      exactDuplicates,
      nearDuplicates,
    };
  } catch (error) {
    const failedAt = now();
    const code = errorCode(error);
    const retryAfterAt = error instanceof FeedFetchError ? error.retryAt : null;
    try {
      const finalized = await dependencies.complete({
        sourceId: source.id,
        leaseToken: source.leaseToken,
        outcome: "failure",
        nextFetchAt: failureNextFetch(source, error, failedAt),
        httpStatus: error instanceof FeedFetchError ? error.status : fetchResult?.status ?? null,
        etag: null,
        lastModified: null,
        responseBytes: fetchResult?.responseBytes ?? null,
        effectiveUrl: fetchResult?.effectiveUrl ?? null,
        articleCount: 0,
        duplicateCount: 0,
        errorCode: code,
        retryAfterAt,
        parserVersion: null,
        now: failedAt,
      });
      if (!finalized) {
        logger.warn("Source failure lease was already superseded", {
          catalogueKey: source.catalogueKey,
        });
      }
    } catch (completionError) {
      logger.error("Source failure could not be finalized", {
        catalogueKey: source.catalogueKey,
        errorCode: errorCode(completionError),
      });
    }
    logger.warn("Source ingestion failed in isolation", {
      catalogueKey: source.catalogueKey,
      errorCode: code,
    });
    return { outcome: "failure", parsedEntries: 0, rejectedEntries: 0, insertedArticles: 0, exactDuplicates: 0, nearDuplicates: 0 };
  }
}

export async function runIngestionBatch(options: {
  workerId?: string;
  batchSize?: number;
  leaseSeconds?: number;
  timeoutMs?: number;
  maxBytes?: number;
  now?: () => Date;
  dependencies?: Partial<IngestionDependencies>;
} = {}): Promise<IngestionBatchResult> {
  const dependencies = { ...defaultDependencies, ...options.dependencies };
  const now = options.now ?? (() => new Date());
  const workerId = options.workerId ?? randomUUID();
  const result: IngestionBatchResult = {
    workerId,
    claimed: 0,
    succeeded: 0,
    notModified: 0,
    failed: 0,
    parsedEntries: 0,
    rejectedEntries: 0,
    insertedArticles: 0,
    exactDuplicates: 0,
    nearDuplicates: 0,
  };

  await dependencies.heartbeat({ state: "started", at: now() });
  try {
    const sources = await dependencies.claim({
      workerId,
      batchSize: options.batchSize ?? 4,
      leaseSeconds: options.leaseSeconds ?? 300,
      now: now(),
    });
    result.claimed = sources.length;

    for (const source of sources) {
      const sourceResult = await ingestSource({
        source,
        dependencies,
        now,
        timeoutMs: options.timeoutMs ?? DEFAULT_FEED_TIMEOUT_MS,
        maxBytes: options.maxBytes ?? DEFAULT_FEED_MAX_BYTES,
      });
      if (sourceResult.outcome === "success") result.succeeded += 1;
      else if (sourceResult.outcome === "not-modified") result.notModified += 1;
      else result.failed += 1;
      result.parsedEntries += sourceResult.parsedEntries;
      result.rejectedEntries += sourceResult.rejectedEntries;
      result.insertedArticles += sourceResult.insertedArticles;
      result.exactDuplicates += sourceResult.exactDuplicates;
      result.nearDuplicates += sourceResult.nearDuplicates;
    }

    await dependencies.heartbeat({ state: "completed", at: now(), batchSize: sources.length });
    logger.info("Ingestion batch completed", {
      claimed: result.claimed,
      succeeded: result.succeeded,
      notModified: result.notModified,
      failed: result.failed,
      insertedArticles: result.insertedArticles,
    });
    return result;
  } catch (error) {
    await dependencies.heartbeat({ state: "failed", at: now(), errorCode: errorCode(error) }).catch(() => undefined);
    logger.error("Ingestion batch failed before source isolation", {
      errorCode: errorCode(error),
    });
    throw error;
  }
}
