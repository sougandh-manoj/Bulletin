const baseUrl = process.env.WORKER_BASE_URL ?? process.env.APP_BASE_URL;
const cronSecret = process.env.CRON_SHARED_SECRET;
const once = process.argv.includes("--once");
const backupUtcHour = Number(process.env.BACKUP_UTC_HOUR ?? "2");

if (!baseUrl || !cronSecret || cronSecret.length < 32) {
  throw new Error("WORKER_BASE_URL/APP_BASE_URL and a valid CRON_SHARED_SECRET are required");
}

const parsedBaseUrl = new URL(baseUrl);
if (!["localhost", "127.0.0.1"].includes(parsedBaseUrl.hostname)) {
  throw new Error("The worker runner may only target the co-located localhost application");
}
if (!Number.isInteger(backupUtcHour) || backupUtcHour < 0 || backupUtcHour > 23) {
  throw new Error("BACKUP_UTC_HOUR must be an integer from 0 to 23");
}

const stages = [
  ["ingestion", "/api/internal/ingestion"],
  ["intelligence", "/api/internal/intelligence"],
  ["shared-summaries", "/api/internal/shared-summaries"],
  ["personalization", "/api/internal/personalization"],
  // A first personalization pass can request a missing subscriber-language
  // summary. The follow-up passes let that bounded work finish in one cycle.
  ["shared-summaries-followup", "/api/internal/shared-summaries"],
  ["personalization-followup", "/api/internal/personalization"],
  ["delivery", "/api/internal/delivery"],
];

let stopping = false;
let lastBackupDay = null;
process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });

function log(event) {
  process.stdout.write(`${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`);
}

async function runStage(name, path) {
  const startedAt = Date.now();
  try {
    const response = await fetch(new URL(path, parsedBaseUrl), {
      method: "POST",
      headers: { authorization: `Bearer ${cronSecret}` },
      signal: AbortSignal.timeout(300_000),
    });
    const result = await response.json().catch(() => null);
    log({
      stage: name,
      ok: response.ok,
      status: response.status,
      durationMs: Date.now() - startedAt,
      result,
    });
    return response.ok;
  } catch (error) {
    log({
      stage: name,
      ok: false,
      durationMs: Date.now() - startedAt,
      errorType: error instanceof Error ? error.name : "unknown",
    });
    return false;
  }
}

async function runCycle() {
  log({ event: "cycle-started" });
  let ok = true;
  for (const [name, path] of stages) {
    if (stopping) break;
    ok = await runStage(name, path) && ok;
  }
  const now = new Date();
  const utcDay = now.toISOString().slice(0, 10);
  if (!stopping && now.getUTCHours() >= backupUtcHour && lastBackupDay !== utcDay) {
    const backupOk = await runStage("encrypted-backup", "/api/internal/backup");
    if (backupOk) lastBackupDay = utcDay;
    ok = backupOk && ok;
  }
  log({ event: "cycle-completed", ok });
  return ok;
}

do {
  await runCycle();
  if (once || stopping) break;
  const untilNextMinute = 60_000 - (Date.now() % 60_000);
  await new Promise((resolve) => setTimeout(resolve, Math.max(1_000, untilNextMinute)));
} while (!stopping);

log({ event: "runner-stopped" });
