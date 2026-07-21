import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { getTrustedSupabase } from "@/lib/supabase/server";
import { runIngestionBatch } from "@/services/ingestion";

const localOnly = process.env.RUN_PHASE6_LOCAL_INGESTION === "1";

describe.skipIf(!localOnly)("Phase 6 local fixture ingestion", () => {
  it("claims, parses, stores, completes, and releases one local-only source", async () => {
    const databaseUrl = new URL(process.env.SUPABASE_URL ?? "https://invalid.example");
    if (!["127.0.0.1", "localhost"].includes(databaseUrl.hostname)) {
      throw new Error("Phase 6 local ingestion refuses non-local Supabase URLs");
    }

    const database = getTrustedSupabase();
    const sourceId = randomUUID();
    const fixture = await readFile(
      new URL("../lib/ingestion/fixtures/rss-2.xml", import.meta.url),
      "utf8",
    );

    try {
      const { error: sourceError } = await database.from("sources").insert({
        id: sourceId,
        catalogue_key: `phase6-local-${sourceId}`,
        publisher_name: "Phase 6 Local Fixture",
        feed_name: "Deterministic RSS fixture",
        feed_url: `https://fixture.invalid/${sourceId}.xml`,
        publisher_domain: "publisher.example",
        publisher_home_url: "https://publisher.example/",
        category_scope: ["business-economy"],
        language: "en",
        country_code: "IN",
        state_region: "Kerala",
        expected_update_interval: "00:15:00",
        reliability: "tier-1",
        role: "primary",
        is_aggregator: false,
        is_institutional: false,
        terms_status: "approved",
        terms_notes: "Local deterministic fixture only.",
        is_active: true,
        health: "unknown",
        next_fetch_at: "2000-01-01T00:00:00.000Z",
        feed_format: "rss-2.0",
        allowed_hosts: ["fixture.invalid"],
        technical_status: "verified",
      });
      if (sourceError) throw sourceError;

      const result = await runIngestionBatch({
        workerId: randomUUID(),
        batchSize: 1,
        leaseSeconds: 300,
        now: () => new Date("2026-07-18T06:00:00.000Z"),
        dependencies: {
          fetch: async () => ({
            outcome: "success",
            body: fixture,
            status: 200,
            responseBytes: Buffer.byteLength(fixture),
            effectiveUrl: `https://fixture.invalid/${sourceId}.xml`,
            etag: '"fixture-etag"',
            lastModified: "Sat, 18 Jul 2026 05:45:00 GMT",
          }),
          heartbeat: async () => undefined,
        },
      });

      expect(result).toMatchObject({
        claimed: 1,
        succeeded: 1,
        failed: 0,
        parsedEntries: 3,
        rejectedEntries: 2,
        insertedArticles: 1,
      });
      const { data: storedSource, error: storedSourceError } = await database
        .from("sources")
        .select("health, consecutive_failures, etag, lease_token, last_article_count")
        .eq("id", sourceId)
        .single();
      if (storedSourceError) throw storedSourceError;
      expect(storedSource).toMatchObject({
        health: "healthy",
        consecutive_failures: 0,
        etag: '"fixture-etag"',
        lease_token: null,
        last_article_count: 1,
      });
      const { count, error: articleCountError } = await database
        .from("articles")
        .select("id", { count: "exact", head: true })
        .eq("source_id", sourceId);
      if (articleCountError) throw articleCountError;
      expect(count).toBe(1);
    } finally {
      await database.from("articles").delete().eq("source_id", sourceId);
      await database.from("sources").delete().eq("id", sourceId);
    }
  });
});

