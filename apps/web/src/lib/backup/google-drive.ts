import "server-only";

import type { BackupObject, GoogleDriveBackupClient } from "@/lib/backup/storage";

type DriveFetch = typeof fetch;

type TokenResponse = { access_token?: unknown; expires_in?: unknown };
type DriveFile = { id?: unknown; name?: unknown; createdTime?: unknown; size?: unknown };

function assertIdentifier(value: string, label: string) {
  if (!/^[A-Za-z0-9_-]{3,200}$/.test(value)) throw new Error(`invalid-${label}`);
  return value;
}

function driveQueryLiteral(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export class GoogleDriveOAuthClient implements GoogleDriveBackupClient {
  private accessToken: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly credentials: {
      clientId: string;
      clientSecret: string;
      refreshToken: string;
    },
    private readonly request: DriveFetch = fetch,
  ) {}

  private async token() {
    if (this.accessToken && this.accessToken.expiresAt > Date.now() + 60_000) {
      return this.accessToken.value;
    }
    const body = new URLSearchParams({
      client_id: this.credentials.clientId,
      client_secret: this.credentials.clientSecret,
      refresh_token: this.credentials.refreshToken,
      grant_type: "refresh_token",
    });
    const response = await this.request("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(20_000),
    });
    const result = await response.json().catch(() => ({})) as TokenResponse;
    if (!response.ok || typeof result.access_token !== "string") {
      throw new Error(`google-drive-token-${response.status}`);
    }
    const expiresIn = typeof result.expires_in === "number" ? result.expires_in : 3_600;
    this.accessToken = { value: result.access_token, expiresAt: Date.now() + expiresIn * 1_000 };
    return result.access_token;
  }

  private async authorized(url: string, init: RequestInit = {}) {
    const token = await this.token();
    return this.request(url, {
      ...init,
      headers: { ...init.headers, authorization: `Bearer ${token}` },
      signal: init.signal ?? AbortSignal.timeout(60_000),
    });
  }

  private async find(folderId: string, name: string): Promise<DriveFile | null> {
    const folder = assertIdentifier(folderId, "drive-folder-id");
    const query = `'${driveQueryLiteral(folder)}' in parents and name = '${driveQueryLiteral(name)}' and trashed = false`;
    const url = new URL("https://www.googleapis.com/drive/v3/files");
    url.searchParams.set("q", query);
    url.searchParams.set("spaces", "drive");
    url.searchParams.set("fields", "files(id,name,createdTime,size)");
    url.searchParams.set("pageSize", "2");
    const response = await this.authorized(url.toString());
    const body = await response.json().catch(() => ({})) as { files?: unknown };
    if (!response.ok || !Array.isArray(body.files)) throw new Error(`google-drive-find-${response.status}`);
    if (body.files.length > 1) throw new Error("google-drive-duplicate-object");
    return (body.files[0] as DriveFile | undefined) ?? null;
  }

  async uploadEncryptedBackup(input: { folderId: string; name: string; payload: Buffer }) {
    const folderId = assertIdentifier(input.folderId, "drive-folder-id");
    if (await this.find(folderId, input.name)) throw new Error("google-drive-object-exists");
    const boundary = `bulletin-${crypto.randomUUID()}`;
    const metadata = Buffer.from(JSON.stringify({
      name: input.name,
      parents: [folderId],
      mimeType: "application/octet-stream",
      description: "Bulletin AES-256-GCM encrypted PostgreSQL backup",
    }));
    const payload = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`),
      metadata,
      Buffer.from(`\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`),
      input.payload,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const response = await this.authorized(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
      {
        method: "POST",
        headers: { "content-type": `multipart/related; boundary=${boundary}` },
        body: payload,
      },
    );
    if (!response.ok) throw new Error(`google-drive-upload-${response.status}`);
  }

  async downloadEncryptedBackup(input: { folderId: string; name: string }) {
    const file = await this.find(input.folderId, input.name);
    if (!file || typeof file.id !== "string") throw new Error("google-drive-object-missing");
    const id = assertIdentifier(file.id, "drive-file-id");
    const response = await this.authorized(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`);
    if (!response.ok) throw new Error(`google-drive-download-${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }

  async listEncryptedBackups(input: { folderId: string }): Promise<BackupObject[]> {
    const folder = assertIdentifier(input.folderId, "drive-folder-id");
    const query = `'${driveQueryLiteral(folder)}' in parents and trashed = false`;
    const url = new URL("https://www.googleapis.com/drive/v3/files");
    url.searchParams.set("q", query);
    url.searchParams.set("spaces", "drive");
    url.searchParams.set("orderBy", "createdTime desc");
    url.searchParams.set("fields", "files(id,name,createdTime,size)");
    url.searchParams.set("pageSize", "100");
    const response = await this.authorized(url.toString());
    const body = await response.json().catch(() => ({})) as { files?: unknown };
    if (!response.ok || !Array.isArray(body.files)) throw new Error(`google-drive-list-${response.status}`);
    return body.files.flatMap((candidate): BackupObject[] => {
      const file = candidate as DriveFile;
      if (typeof file.name !== "string" || !file.name.endsWith(".dump.enc")) return [];
      if (typeof file.createdTime !== "string") return [];
      const createdAt = new Date(file.createdTime);
      if (!Number.isFinite(createdAt.getTime())) return [];
      const size = typeof file.size === "string" ? Number(file.size) : Number(file.size ?? 0);
      return [{ key: file.name, createdAt, size: Number.isSafeInteger(size) && size >= 0 ? size : 0 }];
    });
  }

  async deleteEncryptedBackup(input: { folderId: string; name: string }) {
    const file = await this.find(input.folderId, input.name);
    if (!file || typeof file.id !== "string") return;
    const id = assertIdentifier(file.id, "drive-file-id");
    const response = await this.authorized(`https://www.googleapis.com/drive/v3/files/${id}`, { method: "DELETE" });
    if (!response.ok && response.status !== 404) throw new Error(`google-drive-delete-${response.status}`);
  }
}
