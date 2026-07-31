import { createHash, randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { getTrustedSupabase } from "@/lib/supabase/server";
import { runPersonalizationBatch } from "@/services/personalization";

const localOnly = process.env.RUN_PHASE8_LOCAL_PERSONALIZATION === "1";

function hash(value: string): string {
  return `\\x${createHash("sha256").update(value).digest("hex")}`;
}

describe.skipIf(!localOnly)("Phase 8 local deterministic personalization fixture", () => {
  it("schedules once and stores one exact verified story without provider work", async () => {
    const databaseUrl = new URL(process.env.SUPABASE_URL ?? "https://invalid.example");
    if (!["127.0.0.1", "localhost"].includes(databaseUrl.hostname)) {
      throw new Error("Phase 8 local fixture refuses non-local Supabase URLs");
    }
    const database = getTrustedSupabase();
    const subscriberId = randomUUID();
    const articleId = randomUUID();
    const clusterId = randomUUID();
    const clusterReference = randomUUID();
    const summaryId = randomUUID();
    try {
      const { data: source, error: sourceError } = await database
        .from("sources")
        .select("id")
        .eq("reliability", "tier-1")
        .eq("is_aggregator", false)
        .limit(1)
        .single();
      if (sourceError) throw sourceError;

      const { error: subscriberError } = await database.from("subscribers").insert({
        id: subscriberId,
        email: `phase8-${subscriberId}@example.com`,
        name: "Phase 8 Fixture",
        status: "active",
        verified_at: "2026-07-19T00:00:00.000Z",
        consent_at: "2026-07-01T00:00:00.000Z",
        consent_version: "2026-07-12",
      });
      if (subscriberError) throw subscriberError;
      const { error: preferenceError } = await database.from("subscriber_preferences").insert({
        subscriber_id: subscriberId,
        country_code: "IN",
        state_region: "Kerala",
        city: "Kochi",
        language: "en",
        categories: ["science"],
        custom_topics: [],
        excluded_topics: [],
        story_count: 4,
        theme: "light-editorial",
      });
      if (preferenceError) throw preferenceError;
      const { error: scheduleError } = await database.from("subscriber_schedules").insert({
        subscriber_id: subscriberId,
        frequency: "daily",
        local_delivery_time: "08:00:00",
        timezone: "Asia/Kolkata",
        next_delivery_at: "2026-07-19T02:30:00.000Z",
      });
      if (scheduleError) throw scheduleError;
      const { error: articleError } = await database.from("articles").insert({
        id: articleId,
        source_id: source.id,
        original_title: "Fixture science mission reports a verified result",
        normalized_title: "fixture science mission reports a verified result",
        description: "A factual result supported by an approved source.",
        canonical_url: `https://fixture.invalid/${articleId}`,
        canonical_url_hash: hash(`url-${articleId}`),
        normalized_title_hash: hash(`title-${articleId}`),
        published_at: "2026-07-19T01:30:00.000Z",
        declared_language: "en",
        country_code: "IN",
        processing_status: "processed",
        processed_at: "2026-07-19T02:00:00.000Z",
        factual_depth: 3,
        next_processing_at: "2026-07-19T02:00:00.000Z",
      });
      if (articleError) throw articleError;
      const { error: clusterError } = await database.from("story_clusters").insert({
        id: clusterId,
        public_reference: clusterReference,
        status: "verified",
        category: "science",
        country_code: "IN",
        central_topics: ["space science"],
        entities: { organizations: ["Fixture Space Agency"] },
        evidence_strength: "strong",
        current_version: 1,
        latest_event_at: "2026-07-19T01:30:00.000Z",
        verified_at: "2026-07-19T02:00:00.000Z",
        evidence_independence_count: 2,
        evidence_result: { policyVersion: "phase-7-v1" },
        conflict_details: [],
        event_type: "science-result",
        verification_version: "phase-7-v1",
      });
      if (clusterError) throw clusterError;
      const { error: relationError } = await database.from("story_cluster_articles").insert({
        cluster_id: clusterId,
        article_id: articleId,
        decision: "accepted",
        decision_method: "phase-8-local-fixture",
        added_in_version: 1,
      });
      if (relationError) throw relationError;
      const { error: summaryError } = await database.from("cluster_summaries").insert({
        id: summaryId,
        cluster_id: clusterId,
        cluster_version: 1,
        language: "en",
        status: "verified",
        headline: "Fixture science mission reports a verified result",
        summary: "One supported fact. A second supported fact. A third supported fact.",
        why_it_matters: "The result advances public scientific knowledge.",
        verification_result: { passed: true },
        prompt_version: "phase-7-v1",
        schema_version: "phase-7-v1",
        provider: "fixture",
        model: "fixture-model",
        model_metadata: { fixture: true },
        verified_at: "2026-07-19T02:00:00.000Z",
        source_references: [],
        verification_version: "phase-7-v1",
      });
      if (summaryError) throw summaryError;

      const now = () => new Date("2026-07-19T02:31:00.000Z");
      const first = await runPersonalizationBatch({
        workerId: randomUUID(),
        schedulerBatchSize: 10,
        personalizationBatchSize: 10,
        leaseSeconds: 180,
        now,
        dependencies: { heartbeat: async () => undefined },
      });
      expect(first).toMatchObject({
        scheduled: 1,
        claimed: 1,
        ready: 1,
        short: 1,
        empty: 0,
        localizationQueued: 0,
        retrying: 0,
        failed: 0,
      });
      const { data: delivery, error: deliveryError } = await database
        .from("deliveries")
        .select("id, scheduled_for, personalization_status, personalization_version, actual_story_count, news_window_started_at")
        .eq("subscriber_id", subscriberId)
        .single();
      if (deliveryError) throw deliveryError;
      expect(delivery).toMatchObject({
        scheduled_for: "2026-07-19T02:30:00+00:00",
        personalization_status: "ready",
        personalization_version: "phase-8-rules-v1",
        actual_story_count: 1,
        news_window_started_at: "2026-07-18T02:30:00+00:00",
      });
      const { data: stories, error: storiesError } = await database
        .from("delivery_stories")
        .select("position, cluster_id, cluster_version, summary_id, summary_language, selection_score")
        .eq("delivery_id", delivery.id);
      if (storiesError) throw storiesError;
      expect(stories).toEqual([expect.objectContaining({
        position: 1,
        cluster_id: clusterId,
        cluster_version: 1,
        summary_id: summaryId,
        summary_language: "en",
      })]);

      const retry = await runPersonalizationBatch({
        workerId: randomUUID(),
        schedulerBatchSize: 10,
        personalizationBatchSize: 10,
        leaseSeconds: 180,
        now,
        dependencies: { heartbeat: async () => undefined },
      });
      expect(retry).toMatchObject({ scheduled: 0, claimed: 0, ready: 0 });
    } finally {
      if (subscriberId) await database.from("subscribers").delete().eq("id", subscriberId);
      if (clusterId) await database.from("story_clusters").delete().eq("id", clusterId);
      if (articleId) await database.from("articles").delete().eq("id", articleId);
    }
  }, 30_000);
});
