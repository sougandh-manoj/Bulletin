import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { getTrustedSupabase } from "@/lib/supabase/server";

const localOnly = process.env.RUN_PHASE10_LOCAL_LOAD === "1";

describe.skipIf(!localOnly)("Phase 10 local load and scheduler concurrency", () => {
  it("preserves 100 due schedules and 2,000 atomic preference updates", async () => {
    const databaseUrl = new URL(process.env.SUPABASE_URL ?? "https://invalid.example");
    if (!["127.0.0.1", "localhost"].includes(databaseUrl.hostname)) {
      throw new Error("Phase 10 load test refuses non-local Supabase URLs");
    }
    const database = getTrustedSupabase();
    const ids = Array.from({ length: 100 }, () => randomUUID());
    const dueAt = "2099-07-19T02:30:00.000Z";
    try {
      const { error: subscriberError } = await database.from("subscribers").insert(ids.map((id, index) => ({
        id,
        email: `phase10-load-${id}@example.invalid`,
        name: `Load Fixture ${index}`,
        status: "active",
        verified_at: "2099-07-01T00:00:00.000Z",
        consent_at: "2099-07-01T00:00:00.000Z",
        consent_version: "2026-07-12",
      })));
      if (subscriberError) throw subscriberError;
      const { error: preferenceError } = await database.from("subscriber_preferences").insert(ids.map((id) => ({
        subscriber_id: id,
        country_code: "IN",
        state_region: "Kerala",
        language: "en",
        categories: ["india", "technology-ai"],
        custom_topics: [],
        excluded_topics: [],
        story_count: 4,
        theme: "light-editorial",
      })));
      if (preferenceError) throw preferenceError;
      const { error: scheduleError } = await database.from("subscriber_schedules").insert(ids.map((id) => ({
        subscriber_id: id,
        frequency: "daily",
        local_delivery_time: "08:00:00",
        timezone: "Asia/Kolkata",
        next_delivery_at: dueAt,
      })));
      if (scheduleError) throw scheduleError;

      const schedulerStarted = Date.now();
      await Promise.all(Array.from({ length: 5 }, () => database.rpc("enqueue_due_deliveries", {
        p_batch_size: 200,
        p_now: "2099-07-19T02:31:00.000Z",
      })));
      const { data: deliveries, error: deliveryError } = await database
        .from("deliveries")
        .select("subscriber_id,scheduled_for")
        .in("subscriber_id", ids);
      if (deliveryError) throw deliveryError;
      expect(deliveries).toHaveLength(100);
      expect(new Set(deliveries.map((row) => `${row.subscriber_id}:${row.scheduled_for}`)).size).toBe(100);
      expect(Date.now() - schedulerStarted).toBeLessThan(5 * 60_000);

      let versions = new Map(ids.map((id) => [id, 1]));
      for (let round = 0; round < 20; round += 1) {
        const next = await Promise.all(ids.map(async (id, index) => {
          const expected = versions.get(id) ?? 1;
          const { data, error } = await database.rpc("save_subscriber_preferences", {
            p_subscriber_id: id,
            p_expected_version: expected,
            p_name: `Load Fixture ${index}`,
            p_country_code: "IN",
            p_state_region: "Kerala",
            p_city: `Fixture ${round}`,
            p_language: "en",
            p_categories: ["india", "technology-ai"],
            p_custom_topics: [],
            p_excluded_topics: [],
            p_story_count: 4,
            p_theme: "light-editorial",
            p_frequency: "daily",
            p_weekly_day: null,
            p_local_delivery_time: "08:00:00",
            p_timezone: "Asia/Kolkata",
            p_now: `2099-07-19T03:${String(round).padStart(2, "0")}:00.000Z`,
          });
          if (error) throw error;
          return [id, Number(data)] as const;
        }));
        versions = new Map(next);
      }
      expect([...versions.values()].every((version) => version === 21)).toBe(true);
      const { count, error: historyError } = await database
        .from("preference_versions")
        .select("id", { count: "exact", head: true })
        .in("subscriber_id", ids);
      if (historyError) throw historyError;
      expect(count).toBe(2_000);
    } finally {
      await database.from("subscribers").delete().in("id", ids);
    }
  }, 180_000);
});
