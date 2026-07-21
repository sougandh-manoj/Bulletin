import { getIngestionEnvironment } from "@/env/server";
import { createLogger } from "@/lib/logging/logger";
import { privateJson } from "@/lib/security/api";
import { hasValidBearerAuthorization } from "@/lib/security/internal";
import { runDeliveryBatch } from "@/services/delivery";

export const runtime = "nodejs";
export const maxDuration = 300;

const logger = createLogger("delivery-route");

export async function POST(request: Request) {
  try {
    const environment = getIngestionEnvironment();
    if (!hasValidBearerAuthorization(
      request.headers.get("authorization"),
      environment.CRON_SHARED_SECRET,
    )) {
      logger.warn("Delivery request denied");
      return privateJson({ ok: false, message: "Unauthorized" }, {
        status: 401,
        headers: { "WWW-Authenticate": "Bearer", Vary: "Authorization" },
      });
    }
    const result = await runDeliveryBatch({
      batchSize: environment.DELIVERY_BATCH_SIZE,
      leaseSeconds: environment.DELIVERY_LEASE_SECONDS,
    });
    return privateJson({
      ok: true,
      recovered: result.recovered,
      ambiguousRecovered: result.ambiguousRecovered,
      claimed: result.claimed,
      sent: result.sent,
      retrying: result.retrying,
      failed: result.failed,
      gated: result.gated,
      ambiguous: result.ambiguous,
    }, { headers: { Vary: "Authorization" } });
  } catch (error) {
    logger.error("Delivery request failed", {
      errorType: error instanceof Error ? error.name : "unknown",
    });
    return privateJson(
      { ok: false, message: "Briefing delivery is temporarily unavailable" },
      { status: 503, headers: { Vary: "Authorization" } },
    );
  }
}
