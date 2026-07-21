import "server-only";

import { spawn } from "node:child_process";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getServerEnvironment } from "@/env/server";
import { encryptBackup, parseBackupEncryptionKey, sha256Hex } from "@/lib/backup/crypto";
import {
  GoogleDriveBackupStorage,
  LocalBackupStorage,
  retentionDecision,
  type BackupStorageAdapter,
} from "@/lib/backup/storage";
import { GoogleDriveOAuthClient } from "@/lib/backup/google-drive";
import { getTrustedSupabase } from "@/lib/supabase/server";
import { recordAndNotifyOperationalAlert } from "@/services/alerts";

export type DatabaseExporter = () => Promise<Buffer>;

export async function exportPostgresDatabase(databaseUrl: string) {
  return new Promise<Buffer>((resolve, reject) => {
    const child = spawn("pg_dump", [
      "--format=custom", "--no-owner", "--no-privileges",
      "--schema=public", "--schema=bulletin_private", "--schema=extensions",
      databaseUrl,
    ], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const output: Buffer[] = [];
    let errorText = "";
    child.stdout.on("data", (chunk: Buffer) => output.push(chunk));
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => { errorText += chunk; });
    child.on("error", reject);
    child.on("close", (code) => code === 0
      ? resolve(Buffer.concat(output))
      : reject(new Error(`database-export-failed-${code}:${errorText.slice(0, 120)}`)));
  });
}

async function createRun(database: SupabaseClient, adapter: string, now: Date) {
  const { data, error } = await database.from("backup_runs").insert({
    status: "running",
    storage_adapter: adapter,
    encrypted: true,
    started_at: now.toISOString(),
  }).select("id").single();
  if (error || !data) throw new Error(error?.code ?? "backup-run-not-created");
  return String(data.id);
}

export async function runEncryptedBackup(options?: {
  now?: Date;
  exporter?: DatabaseExporter;
  storage?: BackupStorageAdapter;
  encryptionKey?: Buffer;
  database?: SupabaseClient;
}) {
  const environment = getServerEnvironment();
  const now = options?.now ?? new Date();
  const database = options?.database ?? getTrustedSupabase();
  const storage = options?.storage ?? (environment.BACKUP_STORAGE_ADAPTER === "google-drive"
    ? new GoogleDriveBackupStorage(
        environment.GOOGLE_DRIVE_BACKUP_FOLDER_ID ?? "",
        new GoogleDriveOAuthClient({
          clientId: environment.GOOGLE_DRIVE_CLIENT_ID ?? "",
          clientSecret: environment.GOOGLE_DRIVE_CLIENT_SECRET ?? "",
          refreshToken: environment.GOOGLE_DRIVE_REFRESH_TOKEN ?? "",
        }),
      )
    : new LocalBackupStorage(environment.BACKUP_LOCAL_DIRECTORY ?? "/tmp/bulletin-backups"));
  const key = options?.encryptionKey ?? parseBackupEncryptionKey(environment.BACKUP_ENCRYPTION_KEY ?? "");
  const exporter = options?.exporter ?? (() => {
    if (!environment.BACKUP_DATABASE_URL) throw new Error("backup-database-url-missing");
    return exportPostgresDatabase(environment.BACKUP_DATABASE_URL);
  });
  const runId = await createRun(database, storage.name, now);
  try {
    const dump = await exporter();
    const encrypted = encryptBackup(dump, key);
    const objectKey = `bulletin-${now.toISOString().replace(/[:.]/g, "-")}.dump.enc`;
    await storage.put(objectKey, encrypted);
    const retention = retentionDecision(await storage.list());
    for (const item of retention.remove) await storage.delete(item.key);
    const checksum = sha256Hex(encrypted);
    const { error } = await database.from("backup_runs").update({
      status: "succeeded",
      object_key: objectKey,
      checksum_sha256: checksum,
      size_bytes: encrypted.length,
      completed_at: new Date().toISOString(),
      safe_metadata: { retained: retention.keep.length, removed: retention.remove.length },
    }).eq("id", runId);
    if (error) throw new Error(error.code);
    return { runId, objectKey, checksum, size: encrypted.length, removed: retention.remove.map((item) => item.key) };
  } catch (error) {
    await database.from("backup_runs").update({
      status: "failed",
      failure_code: error instanceof Error ? error.message.split(":")[0].slice(0, 100) : "backup-failed",
      completed_at: new Date().toISOString(),
    }).eq("id", runId);
    await recordAndNotifyOperationalAlert({
      key: "encrypted-backup-failed",
      severity: "critical",
      title: "The encrypted database backup failed",
      details: { runId },
      now: new Date(),
      database,
    }).catch(() => undefined);
    throw error;
  }
}
