import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { chmod, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

const fixturePath = "/tmp/bulletin-phase4-browser-fixture.json";
const cleanupOnly = process.argv.includes("--cleanup");

function localEnvironment() {
  const output = execFileSync(path.resolve("node_modules/.bin/supabase"), ["status", "-o", "env"], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return Object.fromEntries(output.split("\n").flatMap((line) => {
    const match = line.match(/^([A-Z_]+)="(.*)"$/);
    return match ? [[match[1], match[2]]] : [];
  }));
}

function bytea(value) {
  return `\\x${createHash("sha256").update(value).digest("hex")}`;
}

const environment = localEnvironment();
const database = createClient(environment.API_URL, environment.SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  realtime: { transport: WebSocket },
});

try {
  const previous = JSON.parse(await readFile(fixturePath, "utf8"));
  if (previous.subscriberId) await database.rpc("delete_subscriber", { p_subscriber_id: previous.subscriberId });
} catch {
  // No previous local-only fixture to remove.
}

if (cleanupOnly) {
  await rm(fixturePath, { force: true });
  process.stdout.write("Local Phase 4 browser fixture removed.\n");
  process.exit(0);
}

const now = new Date();
const email = `phase4-browser-${randomBytes(8).toString("hex")}@example.invalid`;
const created = await database.rpc("create_pending_subscriber", {
  p_email: email,
  p_name: "Browser Fixture Reader",
  p_country_code: "IN",
  p_state_region: "Kerala",
  p_city: "Kochi",
  p_language: "en",
  p_categories: ["india", "technology-ai"],
  p_custom_topics: ["space policy"],
  p_excluded_topics: ["celebrity gossip"],
  p_story_count: 3,
  p_theme: "light-editorial",
  p_frequency: "weekdays",
  p_weekly_day: null,
  p_local_delivery_time: "08:00",
  p_timezone: "Asia/Kolkata",
  p_consent_at: now.toISOString(),
  p_consent_version: "2026-07-12",
  p_now: now.toISOString(),
});
if (created.error) throw new Error("Could not create local browser fixture");

const subscriberId = created.data[0].subscriber_id;
const rawToken = randomBytes(32).toString("base64url");
const issued = await database.rpc("issue_verification_token", {
  p_subscriber_id: subscriberId,
  p_token_hash: bytea(rawToken),
  p_now: now.toISOString(),
});
if (issued.error) throw new Error("Could not issue local browser fixture token");

await writeFile(fixturePath, JSON.stringify({
  subscriberId,
  verificationUrl: `http://localhost:3000/access/verify?t=${rawToken}`,
}), { encoding: "utf8", mode: 0o600 });
await chmod(fixturePath, 0o600);
process.stdout.write("Local Phase 4 browser fixture created.\n");
