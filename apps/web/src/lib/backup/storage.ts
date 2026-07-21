import "server-only";

import { mkdir, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export type BackupObject = { key: string; createdAt: Date; size: number };

export interface BackupStorageAdapter {
  readonly name: "local" | "google-drive" | "fake";
  put(key: string, payload: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  list(): Promise<BackupObject[]>;
  delete(key: string): Promise<void>;
}

function safeKey(key: string) {
  if (!/^[a-zA-Z0-9._-]+$/.test(key)) throw new Error("unsafe-backup-object-key");
  return key;
}

export class LocalBackupStorage implements BackupStorageAdapter {
  readonly name = "local" as const;
  constructor(private readonly directory: string) {}
  private file(key: string) { return path.join(this.directory, safeKey(key)); }
  async put(key: string, payload: Buffer) {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await writeFile(this.file(key), payload, { mode: 0o600, flag: "wx" });
  }
  async get(key: string) { return readFile(this.file(key)); }
  async list() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const entries = await readdir(this.directory);
    const result: BackupObject[] = [];
    for (const key of entries.filter((entry) => entry.endsWith(".dump.enc"))) {
      const info = await stat(this.file(key));
      result.push({ key, createdAt: info.birthtimeMs ? info.birthtime : info.mtime, size: info.size });
    }
    return result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  async delete(key: string) { await unlink(this.file(key)); }
}

export type GoogleDriveBackupClient = {
  uploadEncryptedBackup(input: { folderId: string; name: string; payload: Buffer }): Promise<void>;
  downloadEncryptedBackup(input: { folderId: string; name: string }): Promise<Buffer>;
  listEncryptedBackups(input: { folderId: string }): Promise<BackupObject[]>;
  deleteEncryptedBackup(input: { folderId: string; name: string }): Promise<void>;
};

export class GoogleDriveBackupStorage implements BackupStorageAdapter {
  readonly name = "google-drive" as const;
  constructor(
    private readonly folderId: string,
    private readonly client: GoogleDriveBackupClient,
  ) {}
  put(key: string, payload: Buffer) { return this.client.uploadEncryptedBackup({ folderId: this.folderId, name: safeKey(key), payload }); }
  get(key: string) { return this.client.downloadEncryptedBackup({ folderId: this.folderId, name: safeKey(key) }); }
  list() { return this.client.listEncryptedBackups({ folderId: this.folderId }); }
  delete(key: string) { return this.client.deleteEncryptedBackup({ folderId: this.folderId, name: safeKey(key) }); }
}

function isoWeekKey(date: Date) {
  const value = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  value.setUTCDate(value.getUTCDate() + 4 - (value.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(value.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((value.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
  return `${value.getUTCFullYear()}-${String(week).padStart(2, "0")}`;
}

export function retentionDecision(objects: readonly BackupObject[]) {
  const sorted = [...objects].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const keep = new Set<string>();
  const daily = new Set<string>();
  for (const item of sorted) {
    const day = item.createdAt.toISOString().slice(0, 10);
    if (!daily.has(day) && daily.size < 7) {
      daily.add(day);
      keep.add(item.key);
    }
  }
  const weekly = new Set<string>();
  for (const item of sorted) {
    const week = isoWeekKey(item.createdAt);
    if (!weekly.has(week) && weekly.size < 4) {
      weekly.add(week);
      keep.add(item.key);
    }
  }
  return {
    keep: sorted.filter((item) => keep.has(item.key)),
    remove: sorted.filter((item) => !keep.has(item.key)),
  };
}
