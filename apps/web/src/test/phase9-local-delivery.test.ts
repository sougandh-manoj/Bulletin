import { createHash, randomUUID } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { hasDeliveredBriefing, loadLatestDeliveredBriefing } from "@/data/delivery";
import { getTrustedSupabase } from "@/lib/supabase/server";
import { runDeliveryBatch } from "@/services/delivery";

const localOnly = process.env.RUN_PHASE9_LOCAL_DELIVERY === "1";
function hash(value: string) { return `\\x${createHash("sha256").update(value).digest("hex")}`; }

describe.skipIf(!localOnly)("Phase 9 local non-sending delivery integration", () => {
  it("renders and completes one exact ready delivery once with no live provider or SMTP", async () => {
    const databaseUrl = new URL(process.env.SUPABASE_URL ?? "https://invalid.example");
    if (!["127.0.0.1", "localhost"].includes(databaseUrl.hostname)) throw new Error("Phase 9 fixture refuses non-local Supabase");
    process.env.APP_ENV = "test";
    process.env.APP_BASE_URL ??= "https://bulletin.example";
    process.env.SESSION_SIGNING_SECRET ??= "phase-nine-session-secret-at-least-32-characters";
    process.env.EMAIL_TRANSPORT = "test";
    const database = getTrustedSupabase();
    const subscriberId = randomUUID();
    const deliveryId = randomUUID();
    const articleId = randomUUID();
    const clusterId = randomUUID();
    const clusterReference = randomUUID();
    const summaryId = randomUUID();
    const { data: controls, error: controlsError } = await database
      .from("system_controls")
      .select("email_delivery_enabled,delivery_worker_paused")
      .eq("singleton", true)
      .single();
    if (controlsError) throw controlsError;
    try {
      await database.from("system_controls").update({
        email_delivery_enabled: true,
        delivery_worker_paused: false,
      }).eq("singleton", true).throwOnError();
      const { data: source, error: sourceError } = await database.from("sources").select("id").limit(1).single();
      if (sourceError) throw sourceError;
      await database.from("subscribers").insert({ id: subscriberId, email: `phase9-${subscriberId}@example.invalid`, name: "Phase 9 Fixture", status: "active", verified_at: "2026-07-19T00:00:00Z", consent_at: "2026-07-01T00:00:00Z", consent_version: "2026-07-12" }).throwOnError();
      await database.from("subscriber_preferences").insert({ subscriber_id: subscriberId, country_code: "IN", state_region: "Kerala", language: "en", categories: ["science"], story_count: 2, theme: "light-editorial" }).throwOnError();
      await database.from("subscriber_schedules").insert({ subscriber_id: subscriberId, frequency: "daily", local_delivery_time: "08:00:00", timezone: "Asia/Kolkata", next_delivery_at: "2026-07-20T02:30:00Z" }).throwOnError();
      await database.from("articles").insert({ id: articleId, source_id: source.id, original_title: "Exact Phase 9 story", normalized_title: "exact phase 9 story", description: "Supported public facts.", canonical_url: `https://fixture.invalid/${articleId}`, canonical_url_hash: hash(`u-${articleId}`), normalized_title_hash: hash(`t-${articleId}`), published_at: "2026-07-19T01:30:00Z", processing_status: "processed", processed_at: "2026-07-19T02:00:00Z", next_processing_at: "2026-07-19T02:00:00Z" }).throwOnError();
      await database.from("story_clusters").insert({ id: clusterId, public_reference: clusterReference, status: "verified", category: "science", central_topics: ["fixture"], entities: {}, evidence_strength: "strong", current_version: 1, latest_event_at: "2026-07-19T01:30:00Z", verified_at: "2026-07-19T02:00:00Z", evidence_independence_count: 2, evidence_result: {}, conflict_details: [], verification_version: "p7" }).throwOnError();
      await database.from("story_cluster_articles").insert({ cluster_id: clusterId, article_id: articleId, decision: "accepted", decision_method: "phase9-fixture", added_in_version: 1 }).throwOnError();
      await database.from("cluster_summaries").insert({ id: summaryId, cluster_id: clusterId, cluster_version: 1, language: "en", status: "verified", headline: "Exact stored Phase 9 headline", summary: "One supported fact. A second supported fact. A third supported fact.", why_it_matters: "This is the exact stored reason.", verification_result: { passed: true }, prompt_version: "p7", schema_version: "s7", provider: "fixture", model: "fixture", verified_at: "2026-07-19T02:00:00Z", source_references: [], verification_version: "p7" }).throwOnError();
      await database.from("cluster_summary_articles").insert({ summary_id: summaryId, article_id: articleId, citation_order: 1 }).throwOnError();
      await database.from("deliveries").insert({ id: deliveryId, subscriber_id: subscriberId, scheduled_for: "2026-07-20T02:30:00Z", preference_version: 1, language: "en", theme: "light-editorial", next_attempt_at: "2026-07-20T02:30:00Z", news_window_started_at: "2026-07-19T02:30:00Z", news_window_ended_at: "2026-07-20T02:30:00Z", personalization_status: "ready", personalized_at: "2026-07-20T02:29:00Z", personalization_version: "p8", actual_story_count: 1 }).throwOnError();
      await database.from("delivery_stories").insert({ delivery_id: deliveryId, position: 1, cluster_id: clusterId, cluster_public_reference: clusterReference, cluster_version: 1, summary_id: summaryId, summary_language: "en", selection_score: 90, selection_reasons: {}, subject_key: "fixture" }).throwOnError();
      const send = vi.fn(async (message: { recipient: string; html: string; text: string }) => {
        expect(message.recipient).toBe(`phase9-${subscriberId}@example.invalid`);
        expect(message.html).toContain("Exact stored Phase 9 headline");
        expect(message.text).toContain(`https://fixture.invalid/${articleId}`);
        return { messageId: "phase9-non-sending-receipt" };
      });
      const now = () => new Date("2026-07-20T02:31:00Z");
      const first = await runDeliveryBatch({ workerId: randomUUID(), batchSize: 10, leaseSeconds: 300, now, dependencies: { send, heartbeat: async () => undefined, alert: async () => false, resolveAlert: async () => false } });
      expect(first).toMatchObject({ claimed: 1, sent: 1, retrying: 0, failed: 0 });
      expect(send).toHaveBeenCalledOnce();
      const { data: delivery } = await database.from("deliveries").select("status,smtp_message_id,sent_at").eq("id", deliveryId).single();
      expect(delivery).toMatchObject({ status: "sent", smtp_message_id: "phase9-non-sending-receipt" });
      expect(await hasDeliveredBriefing({ subscriberId, database })).toBe(true);
      const webBriefing = await loadLatestDeliveredBriefing({
        owner: {
          subscriberId,
          subscriberName: "Phase 9 Fixture",
          timezone: "Asia/Kolkata",
        },
        database,
      });
      expect(webBriefing).toMatchObject({
        deliveryId,
        subscriberId,
        actualStoryCount: 1,
        stories: [{
          position: 1,
          headline: "Exact stored Phase 9 headline",
          whyItMatters: "This is the exact stored reason.",
          sources: [{ url: `https://fixture.invalid/${articleId}` }],
        }],
      });
      const retry = await runDeliveryBatch({ workerId: randomUUID(), batchSize: 10, leaseSeconds: 300, now, dependencies: { send, heartbeat: async () => undefined, alert: async () => false, resolveAlert: async () => false } });
      expect(retry.claimed).toBe(0);
      expect(send).toHaveBeenCalledOnce();
    } finally {
      await database.from("subscribers").delete().eq("id", subscriberId);
      await database.from("story_clusters").delete().eq("id", clusterId);
      await database.from("articles").delete().eq("id", articleId);
      await database.from("system_controls").update(controls).eq("singleton", true);
    }
  }, 30_000);
});
