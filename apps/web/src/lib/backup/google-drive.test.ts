import { describe, expect, it, vi } from "vitest";

import { GoogleDriveOAuthClient } from "./google-drive";

describe("Google Drive encrypted-backup client", () => {
  it("uses OAuth refresh tokens and never sends credentials to Drive requests", async () => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "access-only", expires_in: 3600 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ files: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "drive_file_123" }), { status: 200 }));
    const client = new GoogleDriveOAuthClient({
      clientId: "client-id",
      clientSecret: "client-secret",
      refreshToken: "refresh-token",
    }, request);
    await client.uploadEncryptedBackup({
      folderId: "folder_123",
      name: "bulletin-2026-07-19.dump.enc",
      payload: Buffer.from("ciphertext"),
    });
    expect(request).toHaveBeenCalledTimes(3);
    expect(String(request.mock.calls[0][0])).toBe("https://oauth2.googleapis.com/token");
    const tokenBody = String(request.mock.calls[0][1]?.body);
    expect(tokenBody).toContain("refresh_token=refresh-token");
    for (const call of request.mock.calls.slice(1)) {
      expect(String(call[0])).not.toContain("refresh-token");
      expect(JSON.stringify(call[1])).not.toContain("client-secret");
      expect((call[1]?.headers as Record<string, string>).authorization).toBe("Bearer access-only");
    }
  });

  it("lists only well-formed encrypted backup objects", async () => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "access-only", expires_in: 3600 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ files: [
        { id: "one", name: "bulletin.dump.enc", createdTime: "2026-07-19T02:00:00Z", size: "123" },
        { id: "two", name: "notes.txt", createdTime: "2026-07-19T02:00:00Z", size: "4" },
      ] }), { status: 200 }));
    const client = new GoogleDriveOAuthClient({ clientId: "id", clientSecret: "secret", refreshToken: "refresh" }, request);
    await expect(client.listEncryptedBackups({ folderId: "folder_123" })).resolves.toEqual([
      { key: "bulletin.dump.enc", createdAt: new Date("2026-07-19T02:00:00Z"), size: 123 },
    ]);
  });
});
