import { getIngestionEnvironment } from "@/env/server";
import { createLogger } from "@/lib/logging/logger";
import { privateJson } from "@/lib/security/api";
import { hasValidBearerAuthorization } from "@/lib/security/internal";
import { runEncryptedBackup } from "@/services/backup";

export const runtime = "nodejs";
export const maxDuration = 300;

const logger = createLogger("backup-route");

export async function POST(request: Request) {
  try {
    const environment = getIngestionEnvironment();
    if (!hasValidBearerAuthorization(request.headers.get("authorization"), environment.CRON_SHARED_SECRET)) {
      return privateJson({ ok: false, message: "Unauthorized" }, { status: 401, headers: { Vary: "Authorization" } });
    }
    const result = await runEncryptedBackup();
    return privateJson({ ok: true, runId: result.runId, size: result.size }, { headers: { Vary: "Authorization" } });
  } catch (error) {
    logger.error("Encrypted backup failed", { errorType: error instanceof Error ? error.name : "unknown" });
    return privateJson({ ok: false, message: "Encrypted backup failed" }, { status: 503, headers: { Vary: "Authorization" } });
  }
}
