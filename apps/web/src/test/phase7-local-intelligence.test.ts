import { createHash, randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { StorySummaryProvider, StructuredGenerationRequest } from "@/lib/intelligence/provider";
import { getTrustedSupabase } from "@/lib/supabase/server";
import { enqueueClusterLocalization } from "@/data/intelligence";
import { runIntelligenceBatch } from "@/services/intelligence";
import { runSharedSummaryBatch } from "@/services/shared-summaries";

const localOnly = process.env.RUN_PHASE7_LOCAL_INTELLIGENCE === "1";
function hash(value: string): string {
  return `\\x${createHash("sha256").update(value).digest("hex")}`;
}

describe.skipIf(!localOnly)("Phase 7 local shared-story fixture", () => {
  it("processes two independent articles into one verified trilingual shared story without a live model", async () => {
    const databaseUrl = new URL(process.env.SUPABASE_URL ?? "https://invalid.example");
    if (!["127.0.0.1", "localhost"].includes(databaseUrl.hostname)) {
      throw new Error("Phase 7 local fixture refuses non-local Supabase URLs");
    }
    const database = getTrustedSupabase();
    const sourceIds = [randomUUID(), randomUUID()];
    const articleIds = [randomUUID(), randomUUID()];
    let clusterId: string | null = null;
    const publisherByArticle = new Map([
      [articleIds[0], "Fixture Public Agency"],
      [articleIds[1], "Fixture Independent News"],
    ]);
    const citations = articleIds.map((articleId) => ({ articleId, publisherName: publisherByArticle.get(articleId)! }));
    const canonical = {
      status: "ready" as const, headline: "Fixture agency opens 10 crore grant",
      summary: "The fixture agency opened a 10 crore grant on 18 July. Applications are open in Kochi. Two independent public sources report the announcement.",
      whyItMatters: "The funding may support local projects.", citationArticleIds: articleIds,
      attributionMarkers: citations, uncertaintyMarkers: ["may"], isUpdate: false,
    };
    const generationTasks: StructuredGenerationRequest["task"][] = [];
    const provider: StorySummaryProvider = {
      name: "deterministic-fixture", generationModel: "fixture-structured-v1",
      generateStructured: async (request: StructuredGenerationRequest) => {
        generationTasks.push(request.task);
        if (request.task === "summarization") return canonical;
        if (request.task === "localization") {
          if (request.prompt.includes("Hindi")) return {
            ...canonical, language: "hi", headline: "फिक्स्चर एजेंसी ने 10 करोड़ का अनुदान खोला",
            summary: "फिक्स्चर एजेंसी ने 18 जुलाई को 10 करोड़ का अनुदान खोला। कोच्चि में आवेदन खुले हैं। दो स्वतंत्र सार्वजनिक स्रोतों ने घोषणा की जानकारी दी।",
            whyItMatters: "यह धन स्थानीय परियोजनाओं में मदद कर सकता है।",
          };
          return {
            ...canonical, language: "ml", headline: "ഫിക്‌ചർ ഏജൻസി 10 കോടി ഗ്രാന്റ് തുറന്നു",
            summary: "ഫിക്‌ചർ ഏജൻസി 18 ജൂലൈയിൽ 10 കോടി ഗ്രാന്റ് തുറന്നു. കൊച്ചിയിൽ അപേക്ഷകൾ തുറന്നിരിക്കുന്നു. രണ്ട് സ്വതന്ത്ര പൊതു സ്രോതസ്സുകൾ പ്രഖ്യാപനം റിപ്പോർട്ട് ചെയ്തു.",
            whyItMatters: "ഈ ധനസഹായം പ്രാദേശിക പദ്ധതികളെ സഹായിച്ചേക്കാം.",
          };
        }
        throw new Error(`unexpected fixture task: ${request.task}`);
      },
    };
    const quota = { requestsPerMinute: 100, unitsPerMinute: 1_000_000, requestsPerDay: 1_000, unitsPerDay: 10_000_000 };
    const dependencies = {
      reserve: async () => ({ allowed: true, retryAt: null, reason: null }),
      heartbeat: async () => undefined,
    };

    try {
      for (const [index, sourceId] of sourceIds.entries()) {
        const { error } = await database.from("sources").insert({
          id: sourceId, catalogue_key: `phase7-local-${sourceId}`, publisher_name: index === 0 ? "Fixture Public Agency" : "Fixture Independent News",
          publisher_family_key: index === 0 ? "fixture-public-agency" : "fixture-independent-news",
          publisher_family_metadata: { version: "phase-7-v1", basis: "local-fixture" },
          feed_name: "Phase 7 deterministic fixture", feed_url: `https://fixture.invalid/${sourceId}.xml`, publisher_domain: "fixture.invalid",
          publisher_home_url: "https://fixture.invalid/", category_scope: ["government-schemes"], language: "en", country_code: "IN",
          state_region: "Kerala", reliability: "tier-1", role: "primary", is_aggregator: false, is_institutional: index === 0,
          terms_status: "approved", terms_notes: "Local fixture only.", is_active: false, health: "disabled", feed_format: "rss-2.0",
          allowed_hosts: ["fixture.invalid"], technical_status: "verified",
        });
        if (error) throw error;
      }
      for (const [index, articleId] of articleIds.entries()) {
        const title = index === 0
          ? "Fixture agency opens 10 crore grant"
          : "Independent report confirms Kochi grant programme";
        const description = index === 0
          ? "Applications opened in Kochi on 18 July."
          : "A 10 crore program by Fixture Agency began accepting proposals on 18 July.";
        const { error } = await database.from("articles").insert({
          id: articleId, source_id: sourceIds[index], original_title: title,
          normalized_title: title.toLocaleLowerCase("en"), description,
          canonical_url: `https://fixture.invalid/story-${articleId}`, canonical_url_hash: hash(`url-${articleId}`),
          normalized_title_hash: hash(`title-${articleId}`), published_at: `2026-07-18T06:0${index}:00.000Z`, declared_language: "en",
          country_code: "IN", state_region: "Kerala", city: "Kochi", processing_status: "pending",
          next_processing_at: "2026-07-18T07:00:00.000Z",
        });
        if (error) throw error;
      }

      const intelligence = await runIntelligenceBatch({
        workerId: randomUUID(), batchSize: 2, leaseSeconds: 300,
        now: () => new Date("2026-07-18T08:00:00.000Z"), dependencies,
      });
      expect(intelligence).toMatchObject({ claimed: 2, processed: 2, failed: 0, clustersCreatedOrJoined: 2 });
      const { data: relation, error: relationError } = await database.from("story_cluster_articles")
        .select("cluster_id").in("article_id", articleIds);
      if (relationError) throw relationError;
      expect(new Set(relation?.map((item) => item.cluster_id)).size).toBe(1);
      const verifiedClusterId = relation?.[0]?.cluster_id;
      if (!verifiedClusterId) throw new Error("fixture cluster was not created");
      clusterId = verifiedClusterId;
      const { data: cluster, error: clusterError } = await database.from("story_clusters")
        .select("status, evidence_strength, evidence_independence_count, current_version").eq("id", verifiedClusterId).single();
      if (clusterError) throw clusterError;
      expect(cluster).toMatchObject({ status: "verified", evidence_strength: "sufficient", evidence_independence_count: 2, current_version: 1 });

      const english = await runSharedSummaryBatch({ provider, quota, workerId: randomUUID(), batchSize: 1, leaseSeconds: 300,
        now: () => new Date("2026-07-18T08:10:00.000Z"), dependencies });
      expect(english).toMatchObject({ claimed: 1, verified: 1 });
      await enqueueClusterLocalization({ clusterId: verifiedClusterId, clusterVersion: 1, language: "hi", now: new Date("2026-07-18T08:11:00.000Z"), database });
      await enqueueClusterLocalization({ clusterId: verifiedClusterId, clusterVersion: 1, language: "ml", now: new Date("2026-07-18T08:11:00.000Z"), database });
      const localizations = await runSharedSummaryBatch({ provider, quota, workerId: randomUUID(), batchSize: 2, leaseSeconds: 300,
        now: () => new Date("2026-07-18T08:20:00.000Z"), dependencies });
      expect(localizations).toMatchObject({ claimed: 2, verified: 2 });
      const { data: summaries, error: summaryError } = await database.from("cluster_summaries")
        .select("language, status, source_references").eq("cluster_id", verifiedClusterId).order("language");
      if (summaryError) throw summaryError;
      expect(summaries).toHaveLength(3);
      expect(summaries?.every((item) => item.status === "verified" && item.source_references.length === 2)).toBe(true);
      expect(summaries?.map((item) => item.language).sort()).toEqual(["en", "hi", "ml"]);
      expect(generationTasks).toEqual(["summarization", "localization", "localization"]);
    } finally {
      if (clusterId) await database.from("story_clusters").delete().eq("id", clusterId);
      await database.from("articles").delete().in("id", articleIds);
      await database.from("sources").delete().in("id", sourceIds);
    }
  }, 30_000);
});
