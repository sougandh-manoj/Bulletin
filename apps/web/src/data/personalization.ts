import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  DeliveryFrequency,
  NewsCategory,
  SupportedLanguage,
  Weekday,
} from "@/config/product";
import type {
  PersonalizationCandidate,
  PersonalizationContext,
  ScoredCandidate,
} from "@/lib/personalization/rules";
import { getTrustedSupabase } from "@/lib/supabase/server";

export class PersonalizationDataError extends Error {
  constructor(public readonly code: string, message = "Personalization data operation failed") {
    super(message);
    this.name = "PersonalizationDataError";
  }
}

function dataError(error: { code?: string; message?: string } | null): void {
  if (!error) return;
  throw new PersonalizationDataError(error.code ?? "database-error", error.message);
}

export type ScheduledDelivery = {
  deliveryId: string;
  subscriberId: string;
  scheduledFor: string;
};

export type PersonalizationClaim = {
  deliveryId: string;
  leaseToken: string;
  attemptCount: number;
};

export type DeliveryPersonalizationContext = PersonalizationContext & {
  deliveryId: string;
  subscriberId: string;
  preferenceVersion: number;
  frequency: DeliveryFrequency;
  weeklyDay: Weekday | null;
  timezone: string;
};

type CandidateRow = {
  cluster_id: string;
  cluster_public_reference: string;
  cluster_version: number;
  category: NewsCategory;
  country_code: string | null;
  state_region: string | null;
  city: string | null;
  central_topics: string[];
  entities: Record<string, unknown>;
  event_type: string | null;
  evidence_strength: "sufficient" | "strong";
  evidence_independence_count: number;
  latest_event_at: string;
  summary_id: string | null;
  summary_available: boolean;
  headline: string;
  source_reliability: "tier-1" | "tier-2" | "tier-3";
  factual_depth: number;
  previous_delivered_version: number | null;
};

export async function enqueueDueDeliveries(input: {
  batchSize: number;
  now: Date;
  database?: SupabaseClient;
}): Promise<ScheduledDelivery[]> {
  const database = input.database ?? getTrustedSupabase();
  const { data, error } = await database.rpc("enqueue_due_deliveries", {
    p_batch_size: input.batchSize,
    p_now: input.now.toISOString(),
  });
  dataError(error);
  return ((data ?? []) as {
    delivery_id: string;
    subscriber_id: string;
    scheduled_for: string;
  }[]).map((row) => ({
    deliveryId: row.delivery_id,
    subscriberId: row.subscriber_id,
    scheduledFor: row.scheduled_for,
  }));
}

export async function claimDeliveryPersonalizations(input: {
  workerId: string;
  batchSize: number;
  leaseSeconds: number;
  now: Date;
  database?: SupabaseClient;
}): Promise<PersonalizationClaim[]> {
  const database = input.database ?? getTrustedSupabase();
  const { data, error } = await database.rpc("claim_delivery_personalizations", {
    p_worker_id: input.workerId,
    p_batch_size: input.batchSize,
    p_lease_seconds: input.leaseSeconds,
    p_now: input.now.toISOString(),
  });
  dataError(error);
  return ((data ?? []) as {
    delivery_id: string;
    lease_token: string;
    attempt_count: number;
  }[]).map((row) => ({
    deliveryId: row.delivery_id,
    leaseToken: row.lease_token,
    attemptCount: row.attempt_count,
  }));
}

export async function loadDeliveryPersonalizationContext(input: {
  claim: PersonalizationClaim;
  database?: SupabaseClient;
}): Promise<DeliveryPersonalizationContext> {
  const database = input.database ?? getTrustedSupabase();
  const { data, error } = await database.rpc("load_delivery_personalization_context", {
    p_delivery_id: input.claim.deliveryId,
    p_lease_token: input.claim.leaseToken,
  });
  dataError(error);
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new PersonalizationDataError("personalization-context-missing");
  }
  return data as unknown as DeliveryPersonalizationContext;
}

export async function listDeliveryPersonalizationCandidates(input: {
  claim: PersonalizationClaim;
  limit: number;
  database?: SupabaseClient;
}): Promise<PersonalizationCandidate[]> {
  const database = input.database ?? getTrustedSupabase();
  const { data, error } = await database.rpc("list_delivery_personalization_candidates", {
    p_delivery_id: input.claim.deliveryId,
    p_lease_token: input.claim.leaseToken,
    p_limit: input.limit,
  });
  dataError(error);
  return ((data ?? []) as CandidateRow[]).map((row) => ({
    clusterId: row.cluster_id,
    clusterPublicReference: row.cluster_public_reference,
    clusterVersion: row.cluster_version,
    category: row.category,
    countryCode: row.country_code,
    stateRegion: row.state_region,
    city: row.city,
    centralTopics: row.central_topics ?? [],
    entities: row.entities ?? {},
    eventType: row.event_type,
    evidenceStrength: row.evidence_strength,
    evidenceIndependenceCount: row.evidence_independence_count,
    latestEventAt: row.latest_event_at,
    summaryId: row.summary_id,
    summaryAvailable: row.summary_available,
    headline: row.headline,
    sourceReliability: row.source_reliability,
    factualDepth: row.factual_depth,
    previousDeliveredVersion: row.previous_delivered_version,
  }));
}

export async function enqueueSharedLocalization(input: {
  clusterId: string;
  clusterVersion: number;
  language: Exclude<SupportedLanguage, "en">;
  now: Date;
  database?: SupabaseClient;
}): Promise<string> {
  const database = input.database ?? getTrustedSupabase();
  const { data, error } = await database.rpc("enqueue_cluster_localization", {
    p_cluster_id: input.clusterId,
    p_cluster_version: input.clusterVersion,
    p_language: input.language,
    p_now: input.now.toISOString(),
  });
  dataError(error);
  return String(data);
}

export async function completeDeliveryPersonalization(input: {
  claim: PersonalizationClaim;
  selected: ScoredCandidate[];
  version: string;
  metadata: Record<string, unknown>;
  now: Date;
  database?: SupabaseClient;
}): Promise<boolean> {
  const database = input.database ?? getTrustedSupabase();
  const selectedStories = input.selected.map((candidate, index) => ({
    position: index + 1,
    clusterId: candidate.clusterId,
    clusterPublicReference: candidate.clusterPublicReference,
    clusterVersion: candidate.clusterVersion,
    summaryId: candidate.summaryId,
    score: candidate.score,
    reasons: candidate.reasons,
    subjectKey: candidate.subjectKey,
  }));
  const { data, error } = await database.rpc("complete_delivery_personalization", {
    p_delivery_id: input.claim.deliveryId,
    p_lease_token: input.claim.leaseToken,
    p_selected_stories: selectedStories,
    p_personalization_version: input.version,
    p_metadata: input.metadata,
    p_now: input.now.toISOString(),
  });
  dataError(error);
  return Boolean(data);
}

export async function failDeliveryPersonalization(input: {
  claim: PersonalizationClaim;
  retryAt: Date | null;
  failureCode: string;
  permanent: boolean;
  now: Date;
  database?: SupabaseClient;
}): Promise<boolean> {
  const database = input.database ?? getTrustedSupabase();
  const { data, error } = await database.rpc("fail_delivery_personalization_claim", {
    p_delivery_id: input.claim.deliveryId,
    p_lease_token: input.claim.leaseToken,
    p_retry_at: input.retryAt?.toISOString() ?? null,
    p_failure_code: input.failureCode,
    p_is_permanent: input.permanent,
    p_now: input.now.toISOString(),
  });
  dataError(error);
  return Boolean(data);
}

export async function recordPersonalizationHeartbeat(input: {
  state: "started" | "completed" | "failed";
  at: Date;
  batchSize?: number;
  errorCode?: string;
  database?: SupabaseClient;
}): Promise<void> {
  const database = input.database ?? getTrustedSupabase();
  const values = {
    worker_name: "personalization-scheduler",
    ...(input.state === "started" ? { last_started_at: input.at.toISOString() } : {}),
    ...(input.state === "completed" ? {
      last_completed_at: input.at.toISOString(),
      last_batch_size: input.batchSize ?? 0,
      last_error_code: null,
    } : {}),
    ...(input.state === "failed" ? {
      last_failed_at: input.at.toISOString(),
      last_error_code: input.errorCode ?? "personalization-batch-failed",
    } : {}),
  };
  const { error } = await database.from("worker_heartbeats").upsert(values, {
    onConflict: "worker_name",
  });
  dataError(error);
}
