import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ProviderTaskKind } from "@/lib/intelligence/provider";
import type { ArticleClassification, FinalVerification, LocalizedSummary, SharedSummary } from "@/lib/intelligence/schemas";
import { getTrustedSupabase } from "@/lib/supabase/server";

export type EvidenceSource = {
  id: string;
  title: string;
  description: string | null;
  canonicalUrl: string;
  publishedAt: string;
  language: "en" | "hi" | "ml";
  countryCode: string | null;
  stateRegion: string | null;
  city: string | null;
  classification: ArticleClassification | null;
  entities: ArticleClassification["entities"] | null;
  eventType: string | null;
  eventTime: string | null;
  keyAction: string | null;
  keyOutcome: string | null;
  importantNumbers: ArticleClassification["importantNumbers"];
  publisherName: string;
  publisherFamilyKey: string;
  reliability: "tier-1" | "tier-2" | "tier-3";
  isAggregator: boolean;
  isInstitutional: boolean;
};

export type ClaimedArticle = EvidenceSource & {
  leaseToken: string;
  sourceId: string;
  normalizedTitle: string;
  author: string | null;
  feedCategories: string[];
  processingAttempts: number;
};

export type ClusterCandidate = {
  clusterId: string;
  ruleScore: number;
  snapshot: {
    id: string;
    status: string;
    category: string;
    countryCode: string | null;
    stateRegion: string | null;
    city: string | null;
    centralTopics: string[];
    entities: ArticleClassification["entities"];
    eventType: string;
    eventTime: string | null;
    keyAction: string | null;
    keyOutcome: string | null;
    importantNumbers: ArticleClassification["importantNumbers"];
    isSensitive: boolean;
    currentVersion: number;
    latestEventAt: string;
    evidenceArticles: EvidenceSource[];
  };
};

export type CommitResult = {
  clusterId: string;
  clusterVersion: number;
  clusterStatus: "open" | "verified" | "conflicted";
  evidenceStrength: "weak" | "sufficient" | "strong" | "conflicted";
  independentEvidenceUnits: number;
  meaningfulUpdate: boolean;
  summaryQueued: boolean;
};

export type SummaryClaim = {
  summaryId: string;
  clusterId: string;
  clusterVersion: number;
  language: "en" | "hi" | "ml";
  leaseToken: string;
};

export type SummaryJob = SummaryClaim & {
  isSensitive: boolean;
  evidenceStrength: string;
  evidenceResult: Record<string, unknown>;
  conflictDetails: unknown[];
  isUpdate: boolean;
  evidence: EvidenceSource[];
  canonical: SharedSummary | null;
};

export class IntelligenceDataError extends Error {
  constructor(public readonly code: string, message = "Intelligence data operation failed") {
    super(message);
    this.name = "IntelligenceDataError";
  }
}

function dataError(error: { code?: string; message?: string } | null): void {
  if (error) throw new IntelligenceDataError(error.code ?? "database-error", error.message);
}

type ArticleRow = {
  id: string; source_id: string; original_title: string; normalized_title: string; description: string | null;
  canonical_url: string; published_at: string; declared_language: "en" | "hi" | "ml"; country_code: string | null;
  state_region: string | null; city: string | null; author: string | null; feed_categories: string[] | null;
  event_country_code: string | null; event_state_region: string | null; event_city: string | null;
  processing_attempts: number; classification: ArticleClassification | null; entities: ArticleClassification["entities"] | null;
  event_type: string | null; event_time: string | null; key_action: string | null; key_outcome: string | null;
  important_numbers: ArticleClassification["importantNumbers"] | null;
};
type SourceRow = { id: string; publisher_name: string; publisher_family_key: string; reliability: EvidenceSource["reliability"]; is_aggregator: boolean; is_institutional: boolean };

function evidence(row: ArticleRow, source: SourceRow): EvidenceSource {
  return {
    id: row.id, title: row.original_title, description: row.description, canonicalUrl: row.canonical_url,
    publishedAt: row.published_at, language: row.declared_language, countryCode: row.event_country_code ?? row.country_code,
    stateRegion: row.event_state_region ?? row.state_region, city: row.event_city ?? row.city, classification: row.classification, entities: row.entities,
    eventType: row.event_type, eventTime: row.event_time, keyAction: row.key_action, keyOutcome: row.key_outcome,
    importantNumbers: row.important_numbers ?? [], publisherName: source.publisher_name,
    publisherFamilyKey: source.publisher_family_key, reliability: source.reliability,
    isAggregator: source.is_aggregator, isInstitutional: source.is_institutional,
  };
}

const ARTICLE_SELECT = "id, source_id, original_title, normalized_title, description, canonical_url, published_at, declared_language, country_code, state_region, city, event_country_code, event_state_region, event_city, author, feed_categories, processing_attempts, classification, entities, event_type, event_time, key_action, key_outcome, important_numbers";

export async function claimArticles(input: { workerId: string; batchSize: number; leaseSeconds: number; now: Date; database?: SupabaseClient }): Promise<ClaimedArticle[]> {
  const database = input.database ?? getTrustedSupabase();
  const { data: claimedData, error: claimedError } = await database.rpc("claim_articles", {
    p_worker_id: input.workerId, p_batch_size: input.batchSize, p_lease_seconds: input.leaseSeconds, p_now: input.now.toISOString(),
  });
  dataError(claimedError);
  const claims = (claimedData ?? []) as { article_id: string; lease_token: string }[];
  if (claims.length === 0) return [];
  const { data: articleData, error: articleError } = await database.from("articles").select(ARTICLE_SELECT).in("id", claims.map((item) => item.article_id));
  dataError(articleError);
  const articleRows = (articleData ?? []) as unknown as ArticleRow[];
  const { data: sourceData, error: sourceError } = await database.from("sources").select("id, publisher_name, publisher_family_key, reliability, is_aggregator, is_institutional").in("id", [...new Set(articleRows.map((item) => item.source_id))]);
  dataError(sourceError);
  const articles = new Map(articleRows.map((row) => [row.id, row]));
  const sources = new Map(((sourceData ?? []) as SourceRow[]).map((row) => [row.id, row]));
  return claims.map((claim) => {
    const row = articles.get(claim.article_id);
    const source = row ? sources.get(row.source_id) : null;
    if (!row || !source) throw new IntelligenceDataError("claimed-article-missing");
    return {
      ...evidence(row, source), leaseToken: claim.lease_token, sourceId: row.source_id,
      normalizedTitle: row.normalized_title, author: row.author, feedCategories: row.feed_categories ?? [], processingAttempts: row.processing_attempts,
    };
  });
}

export async function stageArticleIntelligence(input: {
  article: ClaimedArticle; classification: ArticleClassification;
  fingerprint: string; metadata: Record<string, unknown>; database?: SupabaseClient;
}): Promise<boolean> {
  const database = input.database ?? getTrustedSupabase();
  const value = input.classification;
  const { data, error } = await database.rpc("stage_article_intelligence", {
    p_article_id: input.article.id, p_lease_token: input.article.leaseToken, p_classification: value,
    p_classification_version: "phase-7-local-v2", p_entities: value.entities, p_event_type: value.eventType,
    p_event_time: value.eventTime, p_key_action: value.keyAction, p_key_outcome: value.keyOutcome,
    p_important_numbers: value.importantNumbers, p_sensitive_flags: [...value.sensitiveFlags].sort(),
    p_factual_depth: value.factualDepth, p_event_fingerprint: `\\x${input.fingerprint}`,
    p_intelligence_metadata: input.metadata,
  });
  dataError(error);
  return Boolean(data);
}

export async function findClusterCandidates(input: { articleId: string; limit: number; lookbackHours: number; database?: SupabaseClient }): Promise<ClusterCandidate[]> {
  const database = input.database ?? getTrustedSupabase();
  const { data, error } = await database.rpc("find_article_cluster_candidates", {
    p_article_id: input.articleId, p_limit: input.limit, p_lookback_hours: input.lookbackHours,
  });
  dataError(error);
  return ((data ?? []) as { cluster_id: string; rule_score: number; cluster_snapshot: ClusterCandidate["snapshot"] }[]).map((row) => ({
    clusterId: row.cluster_id, ruleScore: Number(row.rule_score), snapshot: row.cluster_snapshot,
  }));
}

export async function commitArticleToCluster(input: {
  article: ClaimedArticle; preferredClusterId: string | null; decisionMethod: string; decisionMetadata: Record<string, unknown>;
  isMeaningfulUpdate: boolean; hasMaterialConflict: boolean; conflicts: string[];
  evidenceDuplicateOfArticleId: string | null; evidenceDuplicateKind: "cross-source-exact" | "cross-source-near" | null;
  now: Date; database?: SupabaseClient;
}): Promise<CommitResult> {
  const database = input.database ?? getTrustedSupabase();
  const { data, error } = await database.rpc("commit_article_to_story_cluster", {
    p_article_id: input.article.id, p_lease_token: input.article.leaseToken, p_preferred_cluster_id: input.preferredClusterId,
    p_decision_method: input.decisionMethod, p_decision_metadata: input.decisionMetadata,
    p_is_meaningful_update: input.isMeaningfulUpdate, p_has_material_conflict: input.hasMaterialConflict,
    p_conflict_details: input.conflicts, p_evidence_duplicate_of_article_id: input.evidenceDuplicateOfArticleId,
    p_evidence_duplicate_kind: input.evidenceDuplicateKind, p_verification_version: "phase-7-v1", p_now: input.now.toISOString(),
  });
  dataError(error);
  return data as CommitResult;
}

export async function promoteClusterForSummary(input: {
  commit: CommitResult;
  now: Date;
  database?: SupabaseClient;
}): Promise<CommitResult> {
  const database = input.database ?? getTrustedSupabase();
  const { data, error } = await database.rpc("promote_title_story_cluster", {
    p_cluster_id: input.commit.clusterId,
    p_now: input.now.toISOString(),
  });
  dataError(error);
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new IntelligenceDataError("title-story-promotion-missing");
  }
  return data as unknown as CommitResult;
}

export async function finishArticleClaim(input: {
  article: ClaimedArticle; status: "retry-wait" | "failed" | "quarantined"; retryAt: Date | null; errorCode: string; now: Date; database?: SupabaseClient;
}): Promise<boolean> {
  const database = input.database ?? getTrustedSupabase();
  const { data, error } = await database.rpc("finish_article_claim", {
    p_article_id: input.article.id, p_lease_token: input.article.leaseToken, p_status: input.status,
    p_retry_at: input.retryAt?.toISOString() ?? null, p_error_code: input.errorCode, p_now: input.now.toISOString(),
  });
  dataError(error);
  return Boolean(data);
}

export async function reserveProviderUsage(input: {
  provider: string; model: string; task: ProviderTaskKind; estimatedUnits: number;
  requestsPerMinute: number; unitsPerMinute: number; requestsPerDay: number; unitsPerDay: number;
  verificationReserve: number; verificationUnitReserve: number; now: Date; database?: SupabaseClient;
}): Promise<{ allowed: boolean; retryAt: Date | null; reason: string | null }> {
  const database = input.database ?? getTrustedSupabase();
  const { data, error } = await database.rpc("reserve_ai_provider_usage", {
    p_provider: input.provider, p_model: input.model, p_task_kind: input.task, p_estimated_input_units: input.estimatedUnits,
    p_requests_per_minute: input.requestsPerMinute, p_units_per_minute: input.unitsPerMinute,
    p_requests_per_day: input.requestsPerDay, p_units_per_day: input.unitsPerDay,
    p_verification_request_reserve: input.verificationReserve,
    p_verification_unit_reserve: input.verificationUnitReserve,
    p_now: input.now.toISOString(),
  });
  dataError(error);
  const row = (data as { allowed: boolean; retry_at: string | null; reason: string | null }[] | null)?.[0];
  if (!row) throw new IntelligenceDataError("quota-result-missing");
  return { allowed: row.allowed, retryAt: row.retry_at ? new Date(row.retry_at) : null, reason: row.reason };
}

export async function claimSummaryJobs(input: { workerId: string; batchSize: number; leaseSeconds: number; now: Date; database?: SupabaseClient }): Promise<SummaryClaim[]> {
  const database = input.database ?? getTrustedSupabase();
  const { data, error } = await database.rpc("claim_cluster_summaries", {
    p_worker_id: input.workerId, p_batch_size: input.batchSize, p_lease_seconds: input.leaseSeconds, p_now: input.now.toISOString(),
  });
  dataError(error);
  return ((data ?? []) as { summary_id: string; cluster_id: string; cluster_version: number; language: SummaryClaim["language"]; lease_token: string }[]).map((row) => ({
    summaryId: row.summary_id, clusterId: row.cluster_id, clusterVersion: row.cluster_version, language: row.language, leaseToken: row.lease_token,
  }));
}

export async function loadSummaryJob(input: { claim: SummaryClaim; database?: SupabaseClient }): Promise<SummaryJob> {
  const database = input.database ?? getTrustedSupabase();
  const { data: clusterData, error: clusterError } = await database.from("story_clusters")
    .select("id, current_version, is_sensitive, evidence_strength, evidence_result, conflict_details")
    .eq("id", input.claim.clusterId).eq("current_version", input.claim.clusterVersion).single();
  dataError(clusterError);
  const { data: relationData, error: relationError } = await database.from("story_cluster_articles")
    .select("article_id, added_in_version").eq("cluster_id", input.claim.clusterId).eq("decision", "accepted")
    .order("added_in_version", { ascending: true }).order("article_id", { ascending: true }).limit(12);
  dataError(relationError);
  const relations = (relationData ?? []) as { article_id: string; added_in_version: number }[];
  const ids = relations.map((row) => row.article_id);
  const { data: articleData, error: articleError } = await database.from("articles").select(ARTICLE_SELECT).in("id", ids);
  dataError(articleError);
  const rows = (articleData ?? []) as unknown as ArticleRow[];
  const { data: sourceData, error: sourceError } = await database.from("sources")
    .select("id, publisher_name, publisher_family_key, reliability, is_aggregator, is_institutional")
    .in("id", [...new Set(rows.map((row) => row.source_id))]);
  dataError(sourceError);
  const articles = new Map(rows.map((row) => [row.id, row]));
  const sources = new Map(((sourceData ?? []) as SourceRow[]).map((row) => [row.id, row]));
  const orderedEvidence = ids.map((id) => {
    const row = articles.get(id); const source = row ? sources.get(row.source_id) : null;
    if (!row || !source) throw new IntelligenceDataError("summary-evidence-missing");
    return evidence(row, source);
  });
  let canonical: SharedSummary | null = null;
  if (input.claim.language !== "en") {
    const { data: canonicalData, error: canonicalError } = await database.from("cluster_summaries")
      .select("headline, summary, why_it_matters, attribution_markers, source_references, verification_result")
      .eq("cluster_id", input.claim.clusterId).eq("cluster_version", input.claim.clusterVersion)
      .eq("language", "en").eq("status", "verified").single();
    dataError(canonicalError);
    const cited = ((canonicalData?.source_references ?? []) as { articleId: string }[]).map((item) => item.articleId);
    canonical = {
      status: "ready", headline: canonicalData!.headline as string, summary: canonicalData!.summary as string,
      whyItMatters: canonicalData!.why_it_matters as string, citationArticleIds: cited,
      attributionMarkers: canonicalData!.attribution_markers as SharedSummary["attributionMarkers"],
      uncertaintyMarkers: ((canonicalData!.verification_result as { uncertaintyMarkers?: string[] } | null)?.uncertaintyMarkers ?? []),
      isUpdate: input.claim.clusterVersion > 1,
    };
  }
  const cluster = clusterData as { is_sensitive: boolean; evidence_strength: string; evidence_result: Record<string, unknown>; conflict_details: unknown[] };
  return { ...input.claim, isSensitive: cluster.is_sensitive, evidenceStrength: cluster.evidence_strength, evidenceResult: cluster.evidence_result,
    conflictDetails: cluster.conflict_details, isUpdate: input.claim.clusterVersion > 1, evidence: orderedEvidence, canonical };
}

export async function completeSummaryJob(input: {
  claim: SummaryClaim; status: "verified" | "retry-wait" | "insufficient-evidence" | "conflicting-evidence" | "invalid-input" | "failed";
  output?: SharedSummary | LocalizedSummary; verification?: FinalVerification; provider?: string; model?: string;
  modelMetadata?: Record<string, unknown>; repairAttempted: boolean; retryAt?: Date | null; errorCode?: string | null; now: Date;
  database?: SupabaseClient;
}): Promise<boolean> {
  const database = input.database ?? getTrustedSupabase();
  const { data, error } = await database.rpc("complete_cluster_summary_claim", {
    p_summary_id: input.claim.summaryId, p_lease_token: input.claim.leaseToken, p_status: input.status,
    p_headline: input.output?.headline ?? null, p_summary: input.output?.summary ?? null,
    p_why_it_matters: input.output?.whyItMatters ?? null, p_attribution_markers: input.output?.attributionMarkers ?? [],
    p_verification_result: input.verification && input.output
      ? { ...input.verification, uncertaintyMarkers: input.output.uncertaintyMarkers }
      : null,
    p_prompt_version: input.output ? "phase-7-summary-only-v2" : null,
    p_schema_version: input.output ? "phase-7-v1" : null, p_provider: input.provider ?? null, p_model: input.model ?? null,
    p_model_metadata: input.modelMetadata ?? null, p_source_article_ids: input.output?.citationArticleIds ?? null,
    p_verification_version: input.verification ? "phase-7-local-v2" : null, p_repair_attempted: input.repairAttempted,
    p_retry_at: input.retryAt?.toISOString() ?? null, p_error_code: input.errorCode ?? null, p_now: input.now.toISOString(),
  });
  dataError(error);
  return Boolean(data);
}

export async function enqueueClusterLocalization(input: { clusterId: string; clusterVersion: number; language: "hi" | "ml"; now: Date; database?: SupabaseClient }): Promise<string> {
  const database = input.database ?? getTrustedSupabase();
  const { data, error } = await database.rpc("enqueue_cluster_localization", {
    p_cluster_id: input.clusterId, p_cluster_version: input.clusterVersion, p_language: input.language, p_now: input.now.toISOString(),
  });
  dataError(error);
  return String(data);
}

export async function recordIntelligenceHeartbeat(input: { workerName: "story-intelligence" | "shared-summaries"; state: "started" | "completed" | "failed"; at: Date; batchSize?: number; errorCode?: string; database?: SupabaseClient }): Promise<void> {
  const database = input.database ?? getTrustedSupabase();
  const values = {
    worker_name: input.workerName,
    ...(input.state === "started" ? { last_started_at: input.at.toISOString() } : {}),
    ...(input.state === "completed" ? { last_completed_at: input.at.toISOString(), last_batch_size: input.batchSize ?? 0, last_error_code: null } : {}),
    ...(input.state === "failed" ? { last_failed_at: input.at.toISOString(), last_error_code: input.errorCode ?? "phase-7-batch-failed" } : {}),
  };
  const { error } = await database.from("worker_heartbeats").upsert(values, { onConflict: "worker_name" });
  dataError(error);
}
