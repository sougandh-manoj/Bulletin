import "server-only";

import { getTrustedSupabase } from "@/lib/supabase/server";

export class OperationsDataError extends Error {
  constructor(public readonly code: string, message = "Owner operations data error") {
    super(message);
    this.name = "OperationsDataError";
  }
}

function dataError(error: { code?: string; message?: string } | null) {
  if (!error) return;
  throw new OperationsDataError(error.code ?? "database-error", error.message);
}

function firstRow<T>(data: T | T[] | null): T | null {
  return Array.isArray(data) ? data[0] ?? null : data;
}

export async function issueAdminAccessToken(input: {
  ownerEmailHash: string;
  tokenHash: string;
  expiresAt: string;
}) {
  const { data, error } = await getTrustedSupabase().rpc("issue_admin_access_token", {
    p_owner_email_hash: input.ownerEmailHash,
    p_token_hash: input.tokenHash,
    p_expires_at: input.expiresAt,
  });
  dataError(error);
  return String(data);
}

export async function consumeAdminAccessToken(input: {
  tokenHash: string;
  sessionHash: string;
  csrfHash: string;
  expiresAt: string;
}) {
  const { data, error } = await getTrustedSupabase().rpc("consume_admin_access_token", {
    p_token_hash: input.tokenHash,
    p_session_hash: input.sessionHash,
    p_csrf_hash: input.csrfHash,
    p_session_expires_at: input.expiresAt,
  });
  dataError(error);
  return Boolean(data);
}

export async function validateAdminSession(input: {
  sessionHash: string;
  csrfHash?: string;
}) {
  const { data, error } = await getTrustedSupabase().rpc("validate_admin_session", {
    p_session_hash: input.sessionHash,
    p_csrf_hash: input.csrfHash ?? null,
  });
  dataError(error);
  return firstRow<{ session_id: string; expires_at: string }>(data);
}

async function count(table: string, column?: string, value?: string) {
  let query = getTrustedSupabase().from(table).select("*", { count: "exact", head: true });
  if (column && value) query = query.eq(column, value);
  const { count: result, error } = await query;
  dataError(error);
  return result ?? 0;
}

export async function loadOwnerOperationsDashboard() {
  const database = getTrustedSupabase();
  const [
    subscriberTotal,
    subscriberActive,
    subscriberPaused,
    subscriberPending,
    deliveryPending,
    deliveryRetrying,
    deliveryFailed,
    deliverySent,
    deliveryCancelled,
    sourceFailing,
    summaryFailed,
    controlsResult,
    deliveriesResult,
    heartbeatsResult,
    alertsResult,
    backupsResult,
  ] = await Promise.all([
    count("subscribers"),
    count("subscribers", "status", "active"),
    count("subscribers", "status", "paused"),
    count("subscribers", "status", "pending"),
    count("deliveries", "status", "pending"),
    count("deliveries", "status", "retry-wait"),
    count("deliveries", "status", "failed"),
    count("deliveries", "status", "sent"),
    count("deliveries", "status", "cancelled"),
    count("sources", "health", "failing"),
    count("cluster_summaries", "status", "failed"),
    database.from("system_controls").select("*").eq("singleton", true).single(),
    database.from("deliveries").select("id, scheduled_for, status, personalization_status, language, theme, attempt_count, manual_retry_count, actual_story_count, failure_code, failure_class, lease_expires_at, sent_at").order("scheduled_for", { ascending: false }).limit(50),
    database.from("worker_heartbeats").select("worker_name, last_started_at, last_completed_at, last_failed_at, last_error_code, last_batch_size").order("worker_name"),
    database.from("alert_events").select("id, deduplication_key, severity, status, title, safe_details, first_seen_at, last_seen_at, occurrence_count").order("last_seen_at", { ascending: false }).limit(30),
    database.from("backup_runs").select("id, status, storage_adapter, object_key, encrypted, checksum_sha256, size_bytes, started_at, completed_at, failure_code, restore_verified_at, restore_validation").order("started_at", { ascending: false }).limit(12),
  ]);
  [controlsResult, deliveriesResult, heartbeatsResult, alertsResult, backupsResult]
    .forEach((result) => dataError(result.error));
  return {
    observedAt: new Date().toISOString(),
    counts: {
      subscribers: { total: subscriberTotal, active: subscriberActive, paused: subscriberPaused, pending: subscriberPending },
      deliveries: { pending: deliveryPending, retrying: deliveryRetrying, failed: deliveryFailed, sent: deliverySent, cancelled: deliveryCancelled },
      intelligence: { failingSources: sourceFailing, failedSummaries: summaryFailed },
    },
    controls: controlsResult.data,
    deliveries: deliveriesResult.data ?? [],
    heartbeats: heartbeatsResult.data ?? [],
    alerts: alertsResult.data ?? [],
    backups: backupsResult.data ?? [],
  };
}

export async function setOwnerControl(input: {
  control: string;
  enabled: boolean;
  requestId: string;
}) {
  const { data, error } = await getTrustedSupabase().rpc("owner_set_system_control", {
    p_control: input.control,
    p_enabled: input.enabled,
    p_request_id: input.requestId,
  });
  dataError(error);
  return Boolean(data);
}

export async function cancelOwnerDelivery(input: { deliveryId: string; requestId: string }) {
  const { data, error } = await getTrustedSupabase().rpc("owner_cancel_pending_delivery", {
    p_delivery_id: input.deliveryId,
    p_request_id: input.requestId,
  });
  dataError(error);
  return Boolean(data);
}

export async function retryOwnerDelivery(input: { deliveryId: string; requestId: string }) {
  const { data, error } = await getTrustedSupabase().rpc("owner_retry_temporary_delivery", {
    p_delivery_id: input.deliveryId,
    p_request_id: input.requestId,
  });
  dataError(error);
  return Boolean(data);
}
