import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const sqlUrl = new URL("../../../supabase/production/phase10_install_vercel_cron.sql", import.meta.url);
const sql = await readFile(fileURLToPath(sqlUrl), "utf8");

const expected = new Map([
  ["bulletin-ingestion", "*/5 * * * *"],
  ["bulletin-intelligence", "* * * * *"],
  ["bulletin-shared-summaries", "* * * * *"],
  ["bulletin-personalization", "* * * * *"],
  ["bulletin-delivery", "* * * * *"],
]);

for (const [name, schedule] of expected) {
  const pattern = new RegExp(`'${name}'\\s*,\\s*'${schedule.replaceAll("*", "\\*")}'`, "m");
  if (!pattern.test(sql)) throw new Error(`missing-or-invalid-cron-job:${name}`);
}

for (const required of [
  "vault.decrypted_secrets",
  "bulletin_app_base_url",
  "bulletin_cron_shared_secret",
  "invalid-bulletin-https-origin",
  "invalid-bulletin-cron-secret",
  "unsupported-bulletin-worker-path",
  "revoke all on function bulletin_private.invoke_vercel_worker(text)",
]) {
  if (!sql.includes(required)) throw new Error(`missing-cron-safety-control:${required}`);
}

if (/Bearer\s+[A-Za-z0-9_-]{32,}/.test(sql)) {
  throw new Error("literal-cron-credential-found");
}

process.stdout.write(`${JSON.stringify({ ok: true, jobs: expected.size, monthlyInvocations30DayEstimate: 181440 })}\n`);
