import { getIngestionEnvironment } from "@/env/server";
import { createLogger } from "@/lib/logging/logger";
import { privateJson } from "@/lib/security/api";
import { hasValidBearerAuthorization } from "@/lib/security/internal";
import { runPersonalizationBatch } from "@/services/personalization";

export const runtime = "nodejs";
export const maxDuration = 300;

const logger = createLogger("personalization-route");

export async function POST(request: Request) {
  try {
    const environment = getIngestionEnvironment();
    if (!hasValidBearerAuthorization(
      request.headers.get("authorization"),
      environment.CRON_SHARED_SECRET,
    )) {
      logger.warn("Personalization request denied");
      return privateJson(
        { ok: false, message: "Unauthorized" },
        {
          status: 401,
          headers: { "WWW-Authenticate": "Bearer", Vary: "Authorization" },
        },
      );
    }
    const result = await runPersonalizationBatch({
      schedulerBatchSize: environment.DELIVERY_SCHEDULER_BATCH_SIZE,
      personalizationBatchSize: environment.PERSONALIZATION_BATCH_SIZE,
      leaseSeconds: environment.PERSONALIZATION_LEASE_SECONDS,
    });
    return privateJson({
      ok: true,
      scheduled: result.scheduled,
      claimed: result.claimed,
      ready: result.ready,
      short: result.short,
      empty: result.empty,
      localizationQueued: result.localizationQueued,
      retrying: result.retrying,
      failed: result.failed,
    }, { headers: { Vary: "Authorization" } });
  } catch (error) {
    logger.error("Personalization request failed", {
      errorType: error instanceof Error ? error.name : "unknown",
    });
    return privateJson(
      { ok: false, message: "Personalization is temporarily unavailable" },
      { status: 503, headers: { Vary: "Authorization" } },
    );
  }
}
