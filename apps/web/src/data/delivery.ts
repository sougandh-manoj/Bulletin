import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  BriefingTheme,
  NewsCategory,
  SupportedLanguage,
} from "@/config/product";
import { getTrustedSupabase } from "@/lib/supabase/server";

export class DeliveryDataError extends Error {
  constructor(public readonly code: string, message = "Delivery data operation failed") {
    super(message);
    this.name = "DeliveryDataError";
  }
}

function dataError(error: { code?: string; message?: string } | null) {
  if (!error) return;
  throw new DeliveryDataError(error.code ?? "database-error", error.message);
}

export type DeliveryClaim = {
  deliveryId: string;
  leaseToken: string;
  attemptCount: number;
};

export type DeliveryRenderContext = {
  deliveryId: string;
  subscriberId: string;
  recipient: string;
  subscriberName: string;
  scheduledFor: string;
  preferenceVersion: number;
  language: SupportedLanguage;
  theme: BriefingTheme;
  timezone: string;
  actualStoryCount: number;
  attemptCount: number;
  stories: Array<{
    position: number;
    clusterPublicReference: string;
    clusterVersion: number;
    summaryId: string;
    category: NewsCategory;
    headline: string;
    summary: string;
    whyItMatters: string;
    isUpdate: boolean;
    sources: Array<{ name: string; url: string; iconUrl?: string | null }>;
  }>;
};

export async function recoverExpiredDeliveryLeases(input: {
  now: Date;
  database?: SupabaseClient;
}) {
  const database = input.database ?? getTrustedSupabase();
  const { data, error } = await database.rpc("recover_expired_delivery_leases", {
    p_now: input.now.toISOString(),
  });
  dataError(error);
  const row = Array.isArray(data) ? data[0] : data;
  return {
    retryable: Number(row?.retryable_count ?? 0),
    ambiguous: Number(row?.ambiguous_count ?? 0),
  };
}

export async function claimDeliveries(input: {
  workerId: string;
  batchSize: number;
  leaseSeconds: number;
  now: Date;
  database?: SupabaseClient;
}): Promise<DeliveryClaim[]> {
  const database = input.database ?? getTrustedSupabase();
  const { data, error } = await database.rpc("claim_deliveries", {
    p_worker_id: input.workerId,
    p_batch_size: input.batchSize,
    p_lease_seconds: input.leaseSeconds,
    p_now: input.now.toISOString(),
  });
  dataError(error);
  return ((data ?? []) as Array<{ delivery_id: string; lease_token: string; attempt_count: number }>).map((row) => ({
    deliveryId: row.delivery_id,
    leaseToken: row.lease_token,
    attemptCount: Number(row.attempt_count),
  }));
}

export async function loadDeliveryRenderContext(input: {
  claim: DeliveryClaim;
  database?: SupabaseClient;
}): Promise<DeliveryRenderContext> {
  const database = input.database ?? getTrustedSupabase();
  const { data, error } = await database.rpc("load_delivery_render_context", {
    p_delivery_id: input.claim.deliveryId,
    p_lease_token: input.claim.leaseToken,
  });
  dataError(error);
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new DeliveryDataError("delivery-render-context-missing");
  }
  return data as unknown as DeliveryRenderContext;
}

export async function markDeliveryRendered(input: {
  claim: DeliveryClaim;
  storyCount: number;
  now: Date;
  database?: SupabaseClient;
}) {
  const database = input.database ?? getTrustedSupabase();
  const { data, error } = await database.rpc("mark_delivery_rendered", {
    p_delivery_id: input.claim.deliveryId,
    p_lease_token: input.claim.leaseToken,
    p_actual_story_count: input.storyCount,
    p_now: input.now.toISOString(),
  });
  dataError(error);
  return Boolean(data);
}

export async function beginDeliverySend(input: {
  claim: DeliveryClaim;
  now: Date;
  database?: SupabaseClient;
}) {
  const database = input.database ?? getTrustedSupabase();
  const { data, error } = await database.rpc("begin_delivery_send", {
    p_delivery_id: input.claim.deliveryId,
    p_lease_token: input.claim.leaseToken,
    p_now: input.now.toISOString(),
  });
  dataError(error);
  return Boolean(data);
}

export async function completeDeliverySend(input: {
  claim: DeliveryClaim;
  providerMessageId: string;
  now: Date;
  database?: SupabaseClient;
}) {
  const database = input.database ?? getTrustedSupabase();
  const { data, error } = await database.rpc("complete_delivery_send_with_receipt", {
    p_delivery_id: input.claim.deliveryId,
    p_lease_token: input.claim.leaseToken,
    p_provider_message_id: input.providerMessageId,
    p_now: input.now.toISOString(),
  });
  dataError(error);
  return Boolean(data);
}

export async function failDelivery(input: {
  claim: DeliveryClaim;
  retryAt: Date | null;
  failureCode: string;
  failureClass: string;
  permanent: boolean;
  now: Date;
  database?: SupabaseClient;
}) {
  const database = input.database ?? getTrustedSupabase();
  const { data, error } = await database.rpc("fail_delivery_claim", {
    p_delivery_id: input.claim.deliveryId,
    p_lease_token: input.claim.leaseToken,
    p_retry_at: input.retryAt?.toISOString() ?? null,
    p_failure_code: input.failureCode,
    p_failure_class: input.failureClass,
    p_is_permanent: input.permanent,
    p_now: input.now.toISOString(),
  });
  dataError(error);
  return Boolean(data);
}

export async function recordDeliveryHeartbeat(input: {
  state: "started" | "completed" | "failed";
  at: Date;
  batchSize?: number;
  errorCode?: string;
  database?: SupabaseClient;
}) {
  const database = input.database ?? getTrustedSupabase();
  const values = {
    worker_name: "briefing-delivery",
    ...(input.state === "started" ? { last_started_at: input.at.toISOString() } : {}),
    ...(input.state === "completed" ? {
      last_completed_at: input.at.toISOString(),
      last_batch_size: input.batchSize ?? 0,
      last_error_code: null,
    } : {}),
    ...(input.state === "failed" ? {
      last_failed_at: input.at.toISOString(),
      last_error_code: input.errorCode ?? "delivery-batch-failed",
    } : {}),
  };
  const { error } = await database.from("worker_heartbeats").upsert(values, {
    onConflict: "worker_name",
  });
  dataError(error);
}

export async function recordDeliveryAlert(input: {
  key: string;
  severity: "warning" | "critical";
  title: string;
  details: Record<string, unknown>;
  now: Date;
  consecutiveFailuresBeforeCritical?: number;
  database?: SupabaseClient;
}) {
  const database = input.database ?? getTrustedSupabase();
  const { data, error } = input.consecutiveFailuresBeforeCritical
    ? await database.rpc("record_consecutive_operational_alert", {
        p_deduplication_key: input.key,
        p_critical_after: input.consecutiveFailuresBeforeCritical,
        p_title: input.title,
        p_safe_details: input.details,
        p_now: input.now.toISOString(),
      })
    : await database.rpc("record_operational_alert", {
        p_deduplication_key: input.key,
        p_severity: input.severity,
        p_title: input.title,
        p_safe_details: input.details,
        p_now: input.now.toISOString(),
      });
  dataError(error);
  return Boolean(data);
}

export async function resolveDeliveryAlert(input: {
  key: string;
  now: Date;
  database?: SupabaseClient;
}) {
  const database = input.database ?? getTrustedSupabase();
  const { data, error } = await database.rpc("resolve_operational_alert", {
    p_deduplication_key: input.key,
    p_now: input.now.toISOString(),
  });
  dataError(error);
  return Boolean(data);
}
