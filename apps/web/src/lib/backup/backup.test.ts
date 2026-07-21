import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { decryptBackup, encryptBackup, parseBackupEncryptionKey, sha256Hex } from "./crypto";
import { retentionDecision, type BackupObject } from "./storage";

describe("Phase 9 encrypted backup primitives", () => {
  it("encrypts with authenticated AES-256-GCM and rejects tampering/wrong keys", () => {
    const key = randomBytes(32);
    const encrypted = encryptBackup(Buffer.from("private database dump"), key, Buffer.alloc(12, 7));
    expect(encrypted.toString("utf8")).not.toContain("private database dump");
    expect(decryptBackup(encrypted, key).toString()).toBe("private database dump");
    const tampered = Buffer.from(encrypted);
    tampered[tampered.length - 1] ^= 1;
    expect(() => decryptBackup(tampered, key)).toThrow();
    expect(() => decryptBackup(encrypted, randomBytes(32))).toThrow();
    expect(sha256Hex(encrypted)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("requires an independently supplied 32-byte key", () => {
    const key = randomBytes(32);
    expect(parseBackupEncryptionKey(key.toString("base64url"))).toEqual(key);
    expect(() => parseBackupEncryptionKey("committed-short-key")).toThrow();
  });

  it("retains seven daily and four weekly representatives and deletes the rest", () => {
    const objects: BackupObject[] = Array.from({ length: 45 }, (_, index) => ({
      key: `backup-${index}.dump.enc`,
      createdAt: new Date(Date.UTC(2026, 6, 19 - index)),
      size: 100,
    }));
    const decision = retentionDecision(objects);
    const dailyDates = new Set(decision.keep.slice(0, 7).map((item) => item.createdAt.toISOString().slice(0, 10)));
    expect(dailyDates.size).toBe(7);
    expect(decision.keep.length).toBeGreaterThanOrEqual(7);
    expect(decision.keep.length).toBeLessThanOrEqual(11);
    expect(decision.keep.length + decision.remove.length).toBe(objects.length);
  });
});
