import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "../../..");
const artifactDir = path.join(root, "verification", "phase9-backup");
const restoreDatabase = "bulletin_phase9_restore";
const magic = Buffer.from("BULLETIN-BACKUP-V1\n", "utf8");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { maxBuffer: 512 * 1024 * 1024, ...options });
  if (result.status !== 0) {
    throw new Error(`${command}-failed:${String(result.stderr ?? "").slice(0, 300)}`);
  }
  return result.stdout;
}

function encrypt(plaintext, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(magic);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([magic, iv, cipher.getAuthTag(), ciphertext]);
}

function decrypt(payload, key) {
  const ivStart = magic.length;
  const tagStart = ivStart + 12;
  const dataStart = tagStart + 16;
  const decipher = createDecipheriv("aes-256-gcm", key, payload.subarray(ivStart, tagStart));
  decipher.setAAD(magic);
  decipher.setAuthTag(payload.subarray(tagStart, dataStart));
  return Buffer.concat([decipher.update(payload.subarray(dataStart)), decipher.final()]);
}

const names = String(run("docker", ["ps", "--filter", "name=supabase_db_news_agent", "--format", "{{.Names}}"])).trim().split("\n").filter(Boolean);
if (names.length !== 1) throw new Error("local-supabase-database-container-not-found");
const container = names[0];
const startedAt = new Date();
const dump = run("docker", ["exec", container, "pg_dump", "-U", "postgres", "-d", "postgres", "-Fc", "--no-owner", "--no-privileges", "--schema=public", "--schema=bulletin_private", "--schema=extensions"]);
if (!dump.length) throw new Error("empty-database-export");
const key = process.env.PHASE9_BACKUP_KEY
  ? Buffer.from(process.env.PHASE9_BACKUP_KEY, "base64url")
  : randomBytes(32);
if (key.length !== 32) throw new Error("PHASE9_BACKUP_KEY-must-decode-to-32-bytes");
const encrypted = encrypt(dump, key);
const decrypted = decrypt(encrypted, key);
if (!decrypted.equals(dump)) throw new Error("backup-encryption-roundtrip-failed");
await mkdir(artifactDir, { recursive: true, mode: 0o700 });
const objectKey = `bulletin-${startedAt.toISOString().replace(/[:.]/g, "-")}.dump.enc`;
await writeFile(path.join(artifactDir, objectKey), encrypted, { mode: 0o600 });

let validation = "";
try {
  run("docker", ["exec", container, "dropdb", "-U", "postgres", "--if-exists", restoreDatabase]);
  run("docker", ["exec", container, "createdb", "-U", "postgres", restoreDatabase]);
  run("docker", ["exec", container, "psql", "-U", "postgres", "-d", restoreDatabase, "-v", "ON_ERROR_STOP=1", "-c", "drop schema public cascade; drop schema if exists bulletin_private cascade; drop schema if exists extensions cascade;"]);
  run("docker", ["exec", "-i", container, "pg_restore", "-U", "postgres", "-d", restoreDatabase, "--no-owner", "--no-privileges", "--exit-on-error"], { input: decrypted });
  const validationSql = `
    select jsonb_build_object(
      'subscribers', (select count(*) from public.subscribers),
      'preferences', (select count(*) from public.subscriber_preferences),
      'schedules', (select count(*) from public.subscriber_schedules),
      'deliveries', (select count(*) from public.deliveries),
      'clusters', (select count(*) from public.story_clusters),
      'summaries', (select count(*) from public.cluster_summaries),
      'deliveryStories', (select count(*) from public.delivery_stories),
      'forcedRlsTables', (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relrowsecurity and c.relforcerowsecurity),
      'beginDeliverySend', to_regprocedure('public.begin_delivery_send(uuid,uuid,timestamp with time zone)') is not null,
      'loadRenderContext', to_regprocedure('public.load_delivery_render_context(uuid,uuid)') is not null,
      'candidateFunction', to_regprocedure('public.find_article_cluster_candidates(uuid,integer,integer)') is not null,
      'nextDeliveryFunction', to_regprocedure('public.compute_next_delivery_at(timestamp with time zone,public.delivery_frequency,public.weekday,time without time zone,text)') is not null
    );`;
  validation = String(run("docker", ["exec", container, "psql", "-U", "postgres", "-d", restoreDatabase, "-At", "-v", "ON_ERROR_STOP=1", "-c", validationSql])).trim();
  const parsed = JSON.parse(validation);
  if (!parsed.beginDeliverySend || !parsed.loadRenderContext || !parsed.candidateFunction || !parsed.nextDeliveryFunction || parsed.forcedRlsTables < 23) {
    throw new Error("restore-validation-failed");
  }
  const checksum = createHash("sha256").update(encrypted).digest("hex");
  const safeValidation = JSON.stringify(parsed).replaceAll("'", "''");
  const recordSql = `insert into public.backup_runs (status,storage_adapter,object_key,encrypted,checksum_sha256,size_bytes,started_at,completed_at,restore_verified_at,restore_validation,safe_metadata) values ('restore-verified','local','${objectKey}',true,'${checksum}',${encrypted.length},'${startedAt.toISOString()}',statement_timestamp(),statement_timestamp(),'${safeValidation}'::jsonb,'{"drill":"clean-local-database"}'::jsonb);`;
  run("docker", ["exec", container, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", recordSql]);
  process.stdout.write(`${JSON.stringify({ ok: true, objectKey, encryptedBytes: encrypted.length, validation: parsed })}\n`);
} finally {
  run("docker", ["exec", container, "dropdb", "-U", "postgres", "--if-exists", restoreDatabase]);
}
