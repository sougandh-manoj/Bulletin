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

type DeliveredBriefingOwner = {
  subscriberId: string;
  subscriberName: string;
  timezone: string;
};

type DeliveryRow = {
  id: string;
  scheduled_for: string;
  preference_version: number;
  language: SupportedLanguage;
  theme: BriefingTheme;
  actual_story_count: number;
  attempt_count: number;
};

type DeliveryStoryRow = {
  position: number;
  cluster_id: string | null;
  cluster_public_reference: string;
  cluster_version: number;
  summary_id: string | null;
  is_update: boolean;
};

export async function hasDeliveredBriefing(input: {
  subscriberId: string;
  database?: SupabaseClient;
}) {
  const database = input.database ?? getTrustedSupabase();
  const { data, error } = await database
    .from("deliveries")
    .select("id")
    .eq("subscriber_id", input.subscriberId)
    .eq("status", "sent")
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();
  dataError(error);
  return Boolean(data);
}

export async function loadLatestDeliveredBriefing(input: {
  owner: DeliveredBriefingOwner;
  database?: SupabaseClient;
}): Promise<DeliveryRenderContext | null> {
  const database = input.database ?? getTrustedSupabase();
  const { data: delivery, error: deliveryError } = await database
    .from("deliveries")
    .select("id,scheduled_for,preference_version,language,theme,actual_story_count,attempt_count")
    .eq("subscriber_id", input.owner.subscriberId)
    .eq("status", "sent")
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle<DeliveryRow>();
  dataError(deliveryError);
  if (!delivery) return null;

  const { data: storedStories, error: storiesError } = await database
    .from("delivery_stories")
    .select("position,cluster_id,cluster_public_reference,cluster_version,summary_id,is_update")
    .eq("delivery_id", delivery.id)
    .order("position")
    .returns<DeliveryStoryRow[]>();
  dataError(storiesError);

  const stories = storedStories ?? [];
  if (stories.length !== Number(delivery.actual_story_count)) {
    throw new DeliveryDataError("delivery-story-count-mismatch");
  }
  if (stories.length === 0) {
    return {
      deliveryId: delivery.id,
      subscriberId: input.owner.subscriberId,
      recipient: "",
      subscriberName: input.owner.subscriberName,
      scheduledFor: delivery.scheduled_for,
      preferenceVersion: Number(delivery.preference_version),
      language: delivery.language,
      theme: delivery.theme,
      timezone: input.owner.timezone,
      actualStoryCount: 0,
      attemptCount: Number(delivery.attempt_count),
      stories: [],
    };
  }

  const clusterIds = stories.map((story) => story.cluster_id).filter((id): id is string => Boolean(id));
  const summaryIds = stories.map((story) => story.summary_id).filter((id): id is string => Boolean(id));
  if (clusterIds.length !== stories.length || summaryIds.length !== stories.length) {
    throw new DeliveryDataError("delivery-snapshot-incomplete");
  }

  const [{ data: clusters, error: clustersError }, { data: summaries, error: summariesError }] = await Promise.all([
    database.from("story_clusters").select("id,category").in("id", clusterIds),
    database.from("cluster_summaries").select("id,headline,summary,why_it_matters").in("id", summaryIds),
  ]);
  dataError(clustersError);
  dataError(summariesError);

  const { data: citations, error: citationsError } = await database
    .from("cluster_summary_articles")
    .select("summary_id,article_id,citation_order")
    .in("summary_id", summaryIds)
    .order("citation_order");
  dataError(citationsError);
  const articleIds = (citations ?? []).map((citation) => citation.article_id as string);

  const { data: articles, error: articlesError } = await database
    .from("articles")
    .select("id,canonical_url,source_id")
    .in("id", articleIds);
  dataError(articlesError);
  const sourceIds = (articles ?? []).map((article) => article.source_id as string);

  const { data: sources, error: sourcesError } = await database
    .from("sources")
    .select("id,publisher_name,publisher_icon_url")
    .in("id", sourceIds);
  dataError(sourcesError);

  const clusterById = new Map((clusters ?? []).map((cluster) => [cluster.id as string, cluster]));
  const summaryById = new Map((summaries ?? []).map((summary) => [summary.id as string, summary]));
  const articleById = new Map((articles ?? []).map((article) => [article.id as string, article]));
  const sourceById = new Map((sources ?? []).map((source) => [source.id as string, source]));
  const citationsBySummary = new Map<string, typeof citations>();
  for (const citation of citations ?? []) {
    const summaryId = citation.summary_id as string;
    citationsBySummary.set(summaryId, [...(citationsBySummary.get(summaryId) ?? []), citation]);
  }

  return {
    deliveryId: delivery.id,
    subscriberId: input.owner.subscriberId,
    recipient: "",
    subscriberName: input.owner.subscriberName,
    scheduledFor: delivery.scheduled_for,
    preferenceVersion: Number(delivery.preference_version),
    language: delivery.language,
    theme: delivery.theme,
    timezone: input.owner.timezone,
    actualStoryCount: stories.length,
    attemptCount: Number(delivery.attempt_count),
    stories: stories.map((story) => {
      const cluster = clusterById.get(story.cluster_id!);
      const summary = summaryById.get(story.summary_id!);
      const storyCitations = citationsBySummary.get(story.summary_id!) ?? [];
      if (!cluster || !summary || !summary.headline || !summary.summary || !summary.why_it_matters || storyCitations.length === 0) {
        throw new DeliveryDataError("delivery-snapshot-incomplete");
      }
      return {
        position: Number(story.position),
        clusterPublicReference: story.cluster_public_reference,
        clusterVersion: Number(story.cluster_version),
        summaryId: story.summary_id!,
        category: cluster.category as NewsCategory,
        headline: summary.headline as string,
        summary: summary.summary as string,
        whyItMatters: summary.why_it_matters as string,
        isUpdate: Boolean(story.is_update),
        sources: storyCitations.map((citation) => {
          const article = articleById.get(citation.article_id as string);
          const source = article ? sourceById.get(article.source_id as string) : null;
          if (!article || !source) throw new DeliveryDataError("delivery-source-attribution-invalid");
          return {
            name: source.publisher_name as string,
            url: article.canonical_url as string,
            iconUrl: source.publisher_icon_url as string | null,
          };
        }),
      };
    }),
  };
}

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
