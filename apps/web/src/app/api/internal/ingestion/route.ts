import { getIngestionEnvironment } from "@/env/server";
import { createLogger } from "@/lib/logging/logger";
import { privateJson } from "@/lib/security/api";
import { hasValidBearerAuthorization } from "@/lib/security/internal";
import { runIngestionBatch } from "@/services/ingestion";

export const runtime = "nodejs";
export const maxDuration = 300;

const logger = createLogger("ingestion-route");

export async function POST(request: Request) {
  try {
    const environment = getIngestionEnvironment();
    if (!hasValidBearerAuthorization(
      request.headers.get("authorization"),
      environment.CRON_SHARED_SECRET,
    )) {
      logger.warn("Ingestion request denied");
      return privateJson(
        { ok: false, message: "Unauthorized" },
        { status: 401, headers: { "WWW-Authenticate": "Bearer", Vary: "Authorization" } },
      );
    }

    const result = await runIngestionBatch({
      batchSize: environment.INGESTION_BATCH_SIZE,
      leaseSeconds: environment.INGESTION_LEASE_SECONDS,
      timeoutMs: environment.INGESTION_TIMEOUT_MS,
      maxBytes: environment.INGESTION_MAX_RESPONSE_BYTES,
    });
    return privateJson({
      ok: true,
      claimed: result.claimed,
      succeeded: result.succeeded,
      notModified: result.notModified,
      failed: result.failed,
      parsedEntries: result.parsedEntries,
      rejectedEntries: result.rejectedEntries,
      insertedArticles: result.insertedArticles,
      exactDuplicates: result.exactDuplicates,
      nearDuplicates: result.nearDuplicates,
    }, { headers: { Vary: "Authorization" } });
  } catch (error) {
    logger.error("Ingestion request failed", {
      errorType: error instanceof Error ? error.name : "unknown",
    });
    return privateJson(
      { ok: false, message: "Ingestion is temporarily unavailable" },
      { status: 503, headers: { Vary: "Authorization" } },
    );
  }
}
