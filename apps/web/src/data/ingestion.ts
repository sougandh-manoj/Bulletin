import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { DuplicateCandidate } from "@/lib/ingestion/dedupe";
import type { NormalizedArticle } from "@/lib/ingestion/types";
import { getTrustedSupabase } from "@/lib/supabase/server";

export type ClaimedSource = {
  id: string;
  leaseToken: string;
  catalogueKey: string;
  publisherName: string;
  feedUrl: string;
  allowedHosts: string[];
  language: "en" | "hi" | "ml";
  countryCode: string | null;
  stateRegion: string | null;
  categoryScope: string[];
  expectedUpdateIntervalMs: number;
  consecutiveFailures: number;
  etag: string | null;
  lastModified: string | null;
};

export type ArticleInsert = NormalizedArticle & {
  id: string;
  duplicateOfArticleId: string | null;
  duplicateKind: "same-source-title" | "same-source-near-title" | null;
};

export type BulkInsertResult = {
  inserted: number;
  exactDuplicates: number;
  nearDuplicates: number;
};

type SourceRow = {
  id: string;
  catalogue_key: string;
  publisher_name: string;
  feed_url: string;
  allowed_hosts: string[];
  language: ClaimedSource["language"];
  country_code: string | null;
  state_region: string | null;
  category_scope: string[] | null;
  expected_update_interval: string;
  consecutive_failures: number;
  etag: string | null;
  last_modified: string | null;
};

type CandidateRow = {
  id: string;
  source_id: string;
  normalized_title: string;
  normalized_title_hash: string;
  published_at: string;
};

export class IngestionDataError extends Error {
  constructor(public readonly code: string, message = "Ingestion data operation failed") {
    super(message);
    this.name = "IngestionDataError";
  }
}

function dataError(error: { code?: string; message?: string } | null): void {
  if (error) throw new IngestionDataError(error.code ?? "database-error", error.message);
}

function intervalMilliseconds(value: string): number {
  const match = /^(?:(\d+)\s+days?\s+)?(\d{1,2}):(\d{2}):(\d{2})(?:\.\d+)?$/.exec(value);
  if (!match) throw new IngestionDataError("invalid-source-interval");
  const [, days = "0", hours, minutes, seconds] = match;
  return (((Number(days) * 24 + Number(hours)) * 60 + Number(minutes)) * 60 + Number(seconds)) * 1000;
}

function byteaHex(value: string): string {
  return value.startsWith("\\x") ? value.slice(2) : value;
}

export async function claimDueSources(input: {
  workerId: string;
  batchSize: number;
  leaseSeconds: number;
  now: Date;
  database?: SupabaseClient;
}): Promise<ClaimedSource[]> {
  const database = input.database ?? getTrustedSupabase();
  const { data: claimData, error: claimError } = await database.rpc("claim_due_sources", {
    p_worker_id: input.workerId,
    p_batch_size: input.batchSize,
    p_lease_seconds: input.leaseSeconds,
    p_now: input.now.toISOString(),
  });
  dataError(claimError);
  const claims = (claimData ?? []) as { source_id: string; lease_token: string }[];
  if (claims.length === 0) return [];

  const { data: sourceData, error: sourceError } = await database
    .from("sources")
    .select("id, catalogue_key, publisher_name, feed_url, allowed_hosts, language, country_code, state_region, category_scope, expected_update_interval, consecutive_failures, etag, last_modified")
    .in("id", claims.map(({ source_id }) => source_id));
  dataError(sourceError);
  const rows = (sourceData ?? []) as SourceRow[];
  const byId = new Map(rows.map((row) => [row.id, row]));

  return claims.map((claim) => {
    const row = byId.get(claim.source_id);
    if (!row) throw new IngestionDataError("claimed-source-missing");
    return {
      id: row.id,
      leaseToken: claim.lease_token,
      catalogueKey: row.catalogue_key,
      publisherName: row.publisher_name,
      feedUrl: row.feed_url,
      allowedHosts: row.allowed_hosts,
      language: row.language,
      countryCode: row.country_code,
      stateRegion: row.state_region,
      categoryScope: row.category_scope ?? [],
      expectedUpdateIntervalMs: intervalMilliseconds(row.expected_update_interval),
      consecutiveFailures: row.consecutive_failures,
      etag: row.etag,
      lastModified: row.last_modified,
    };
  });
}

export async function listDuplicateCandidates(input: {
  sourceId: string;
  publishedFrom: Date;
  publishedTo: Date;
  database?: SupabaseClient;
}): Promise<DuplicateCandidate[]> {
  const database = input.database ?? getTrustedSupabase();
  const candidates: DuplicateCandidate[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await database
      .from("articles")
      .select("id, source_id, normalized_title, normalized_title_hash, published_at")
      .eq("source_id", input.sourceId)
      .neq("processing_status", "quarantined")
      .gte("published_at", input.publishedFrom.toISOString())
      .lte("published_at", input.publishedTo.toISOString())
      .order("published_at", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    dataError(error);
    const rows = (data ?? []) as CandidateRow[];
    candidates.push(...rows.map((row) => ({
      id: row.id,
      sourceId: row.source_id,
      normalizedTitle: row.normalized_title,
      normalizedTitleHash: byteaHex(row.normalized_title_hash),
      publishedAt: row.published_at,
    })));
    if (rows.length < pageSize) break;
  }
  return candidates;
}

export async function insertIngestedArticles(input: {
  sourceId: string;
  leaseToken: string;
  articles: ArticleInsert[];
  now: Date;
  database?: SupabaseClient;
}): Promise<BulkInsertResult> {
  if (input.articles.length === 0) return { inserted: 0, exactDuplicates: 0, nearDuplicates: 0 };
  const database = input.database ?? getTrustedSupabase();
  const { data, error } = await database.rpc("insert_ingested_articles", {
    p_source_id: input.sourceId,
    p_source_lease_token: input.leaseToken,
    p_articles: input.articles,
    p_now: input.now.toISOString(),
  });
  dataError(error);
  const result = data as Partial<BulkInsertResult> | null;
  return {
    inserted: Number(result?.inserted ?? 0),
    exactDuplicates: Number(result?.exactDuplicates ?? 0),
    nearDuplicates: Number(result?.nearDuplicates ?? 0),
  };
}

export async function completeSourceIngestion(input: {
  sourceId: string;
  leaseToken: string;
  outcome: "success" | "not-modified" | "failure";
  nextFetchAt: Date;
  httpStatus: number | null;
  etag: string | null;
  lastModified: string | null;
  responseBytes: number | null;
  effectiveUrl: string | null;
  articleCount: number;
  duplicateCount: number;
  errorCode: string | null;
  retryAfterAt: Date | null;
  parserVersion: string | null;
  now: Date;
  database?: SupabaseClient;
}): Promise<boolean> {
  const database = input.database ?? getTrustedSupabase();
  const { data, error } = await database.rpc("complete_source_ingestion", {
    p_source_id: input.sourceId,
    p_lease_token: input.leaseToken,
    p_outcome: input.outcome,
    p_next_fetch_at: input.nextFetchAt.toISOString(),
    p_http_status: input.httpStatus,
    p_etag: input.etag,
    p_last_modified: input.lastModified,
    p_response_bytes: input.responseBytes,
    p_effective_url: input.effectiveUrl,
    p_article_count: input.articleCount,
    p_duplicate_count: input.duplicateCount,
    p_error_code: input.errorCode,
    p_retry_after_at: input.retryAfterAt?.toISOString() ?? null,
    p_parser_version: input.parserVersion,
    p_now: input.now.toISOString(),
  });
  dataError(error);
  return Boolean(data);
}

export async function recordIngestionHeartbeat(input: {
  state: "started" | "completed" | "failed";
  at: Date;
  batchSize?: number;
  errorCode?: string;
  database?: SupabaseClient;
}): Promise<void> {
  const database = input.database ?? getTrustedSupabase();
  const values = {
    worker_name: "rss-ingestion",
    ...(input.state === "started" ? { last_started_at: input.at.toISOString() } : {}),
    ...(input.state === "completed" ? {
      last_completed_at: input.at.toISOString(),
      last_batch_size: input.batchSize ?? 0,
      last_error_code: null,
    } : {}),
    ...(input.state === "failed" ? {
      last_failed_at: input.at.toISOString(),
      last_error_code: input.errorCode ?? "ingestion-batch-failed",
    } : {}),
  };
  const { error } = await database.from("worker_heartbeats").upsert(values, { onConflict: "worker_name" });
  dataError(error);
}
