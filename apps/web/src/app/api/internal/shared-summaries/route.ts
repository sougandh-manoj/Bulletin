import { getIngestionEnvironment, getIntelligenceEnvironment } from "@/env/server";
import { createStorySummaryProvider } from "@/lib/intelligence/factory";
import { createLogger } from "@/lib/logging/logger";
import { privateJson } from "@/lib/security/api";
import { hasValidBearerAuthorization } from "@/lib/security/internal";
import { runSharedSummaryBatch } from "@/services/shared-summaries";

export const runtime = "nodejs";
export const maxDuration = 300;

const logger = createLogger("shared-summaries-route");

export async function POST(request: Request) {
  try {
    const accessEnvironment = getIngestionEnvironment();
    if (!hasValidBearerAuthorization(request.headers.get("authorization"), accessEnvironment.CRON_SHARED_SECRET)) {
      logger.warn("Shared summary request denied");
      return privateJson({ ok: false, message: "Unauthorized" }, {
        status: 401, headers: { "WWW-Authenticate": "Bearer", Vary: "Authorization" },
      });
    }
    const environment = getIntelligenceEnvironment();
    const result = await runSharedSummaryBatch({
      provider: createStorySummaryProvider(environment),
      quota: {
        requestsPerMinute: environment.PROVIDER_REQUESTS_PER_MINUTE,
        unitsPerMinute: environment.PROVIDER_INPUT_UNITS_PER_MINUTE,
        requestsPerDay: environment.PROVIDER_REQUESTS_PER_DAY,
        unitsPerDay: environment.PROVIDER_INPUT_UNITS_PER_DAY,
      },
      batchSize: environment.SHARED_SUMMARY_BATCH_SIZE,
      leaseSeconds: environment.SHARED_SUMMARY_LEASE_SECONDS,
    });
    return privateJson({
      ok: true, claimed: result.claimed, verified: result.verified, retrying: result.retrying,
      failed: result.failed, insufficientEvidence: result.insufficientEvidence,
      conflictingEvidence: result.conflictingEvidence,
    }, { headers: { Vary: "Authorization" } });
  } catch (error) {
    logger.error("Shared summary request failed", { errorType: error instanceof Error ? error.name : "unknown" });
    return privateJson({ ok: false, message: "Shared summaries are temporarily unavailable" }, {
      status: 503, headers: { Vary: "Authorization" },
    });
  }
}
