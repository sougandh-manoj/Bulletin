import { getIngestionEnvironment } from "@/env/server";
import { createLogger } from "@/lib/logging/logger";
import { privateJson } from "@/lib/security/api";
import { hasValidBearerAuthorization } from "@/lib/security/internal";
import { runIntelligenceBatch } from "@/services/intelligence";

export const runtime = "nodejs";
export const maxDuration = 300;

const logger = createLogger("intelligence-route");

export async function POST(request: Request) {
  try {
    const accessEnvironment = getIngestionEnvironment();
    if (!hasValidBearerAuthorization(request.headers.get("authorization"), accessEnvironment.CRON_SHARED_SECRET)) {
      logger.warn("Intelligence request denied");
      return privateJson({ ok: false, message: "Unauthorized" }, {
        status: 401, headers: { "WWW-Authenticate": "Bearer", Vary: "Authorization" },
      });
    }
    const environment = getIngestionEnvironment();
    const result = await runIntelligenceBatch({
      batchSize: environment.INTELLIGENCE_BATCH_SIZE,
      leaseSeconds: environment.INTELLIGENCE_LEASE_SECONDS,
      candidateLimit: environment.INTELLIGENCE_CANDIDATE_LIMIT,
      candidateLookbackHours: environment.INTELLIGENCE_CANDIDATE_LOOKBACK_HOURS,
    });
    return privateJson({
      ok: true, claimed: result.claimed, processed: result.processed, quarantined: result.quarantined,
      retrying: result.retrying, failed: result.failed, clustersCreatedOrJoined: result.clustersCreatedOrJoined,
      meaningfulUpdates: result.meaningfulUpdates, summariesQueued: result.summariesQueued,
    }, { headers: { Vary: "Authorization" } });
  } catch (error) {
    logger.error("Intelligence request failed", { errorType: error instanceof Error ? error.name : "unknown" });
    return privateJson({ ok: false, message: "Story intelligence is temporarily unavailable" }, {
      status: 503, headers: { Vary: "Authorization" },
    });
  }
}
