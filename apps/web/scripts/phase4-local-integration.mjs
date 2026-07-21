import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

function localEnvironment() {
  const supabase = path.resolve("node_modules/.bin/supabase");
  const output = execFileSync(supabase, ["status", "-o", "env"], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return Object.fromEntries(
    output.split("\n").flatMap((line) => {
      const match = line.match(/^([A-Z_]+)="(.*)"$/);
      return match ? [[match[1], match[2]]] : [];
    }),
  );
}

function bytea(value) {
  return `\\x${createHash("sha256").update(value).digest("hex")}`;
}

function rawToken() {
  return randomBytes(32).toString("base64url");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const environment = localEnvironment();
assert(environment.API_URL && environment.SERVICE_ROLE_KEY, "Local Supabase is not available");
const database = createClient(environment.API_URL, environment.SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  realtime: { transport: WebSocket },
});

const createdIds = [];
const now = new Date();

async function rpc(name, parameters) {
  const result = await database.rpc(name, parameters);
  if (result.error) throw Object.assign(new Error(`${name} failed`), { code: result.error.code });
  return result.data;
}

async function createPending(label) {
  const random = randomBytes(8).toString("hex");
  const rows = await rpc("create_pending_subscriber", {
    p_email: `phase4-${label}-${random}@example.invalid`,
    p_name: "Phase Four Integration",
    p_country_code: "IN",
    p_state_region: "Kerala",
    p_city: "Kochi",
    p_language: "en",
    p_categories: ["india", "technology-ai"],
    p_custom_topics: ["space policy"],
    p_excluded_topics: ["celebrity gossip"],
    p_story_count: 3,
    p_theme: "light-editorial",
    p_frequency: "daily",
    p_weekly_day: null,
    p_local_delivery_time: "08:00",
    p_timezone: "Asia/Kolkata",
    p_consent_at: now.toISOString(),
    p_consent_version: "2026-07-12",
    p_now: now.toISOString(),
  });
  const subscriberId = rows[0].subscriber_id;
  createdIds.push(subscriberId);
  return subscriberId;
}

try {
  const subscriberId = await createPending("concurrency");
  const firstToken = rawToken();
  const secondToken = rawToken();
  await rpc("issue_verification_token", {
    p_subscriber_id: subscriberId,
    p_token_hash: bytea(firstToken),
    p_now: now.toISOString(),
  });
  await rpc("issue_verification_token", {
    p_subscriber_id: subscriberId,
    p_token_hash: bytea(secondToken),
    p_now: new Date(now.getTime() + 1_000).toISOString(),
  });

  const firstInspection = await rpc("inspect_verification_token", {
    p_token_hash: bytea(firstToken),
    p_now: new Date(now.getTime() + 2_000).toISOString(),
  });
  const secondInspection = await rpc("inspect_verification_token", {
    p_token_hash: bytea(secondToken),
    p_now: new Date(now.getTime() + 2_000).toISOString(),
  });
  assert(firstInspection[0]?.is_valid === false, "Older verification token remained active");
  assert(secondInspection[0]?.is_valid === true, "Newest verification token was not active");

  const concurrent = await Promise.allSettled([
    rpc("consume_verification_token_with_theme", {
      p_token_hash: bytea(secondToken),
      p_theme: "dark-intelligence",
      p_now: new Date(now.getTime() + 3_000).toISOString(),
    }),
    rpc("consume_verification_token_with_theme", {
      p_token_hash: bytea(secondToken),
      p_theme: "dark-intelligence",
      p_now: new Date(now.getTime() + 3_000).toISOString(),
    }),
  ]);
  assert(concurrent.filter((result) => result.status === "fulfilled").length === 1, "Concurrent verification did not have exactly one winner");
  assert(concurrent.filter((result) => result.status === "rejected").length === 1, "Concurrent verification did not reject the replay");

  const selectedTheme = await database
    .from("subscriber_preferences")
    .select("theme")
    .eq("subscriber_id", subscriberId)
    .single();
  if (selectedTheme.error) throw selectedTheme.error;
  assert(selectedTheme.data.theme === "dark-intelligence", "Verification did not save the selected first theme");

  const sessionToken = rawToken();
  const csrfToken = rawToken();
  await rpc("create_subscriber_session", {
    p_subscriber_id: subscriberId,
    p_session_hash: bytea(sessionToken),
    p_csrf_hash: bytea(csrfToken),
    p_expected_token_version: 1,
    p_expires_at: new Date(now.getTime() + 30 * 60_000).toISOString(),
    p_now: new Date(now.getTime() + 4_000).toISOString(),
  });
  const validSession = await rpc("validate_subscriber_session", {
    p_session_hash: bytea(sessionToken),
    p_csrf_hash: bytea(csrfToken),
    p_now: new Date(now.getTime() + 5_000).toISOString(),
  });
  const wrongCsrf = await rpc("validate_subscriber_session", {
    p_session_hash: bytea(sessionToken),
    p_csrf_hash: bytea("wrong-csrf"),
    p_now: new Date(now.getTime() + 5_000).toISOString(),
  });
  assert(validSession.length === 1 && wrongCsrf.length === 0, "Session/CSRF validation failed closed incorrectly");

  await rpc("revoke_subscriber_session", {
    p_session_hash: bytea(sessionToken),
    p_now: new Date(now.getTime() + 6_000).toISOString(),
  });
  const revoked = await rpc("validate_subscriber_session", {
    p_session_hash: bytea(sessionToken),
    p_csrf_hash: null,
    p_now: new Date(now.getTime() + 7_000).toISOString(),
  });
  assert(revoked.length === 0, "Revoked session remained usable");

  const expirySubscriber = await createPending("expiry");
  const expiringToken = rawToken();
  await rpc("issue_verification_token", {
    p_subscriber_id: expirySubscriber,
    p_token_hash: bytea(expiringToken),
    p_now: now.toISOString(),
  });
  const expired = await rpc("inspect_verification_token", {
    p_token_hash: bytea(expiringToken),
    p_now: new Date(now.getTime() + 25 * 60 * 60_000).toISOString(),
  });
  assert(expired[0]?.is_valid === false, "24-hour verification expiry was not enforced");

  process.stdout.write("Phase 4 local integration: 11 checks passed (invalidation, expiry, one-time/concurrent consumption, first theme, session, CSRF, revocation).\n");
} finally {
  for (const subscriberId of createdIds) {
    await database.rpc("delete_subscriber", { p_subscriber_id: subscriberId });
  }
}
