import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const MAGIC = Buffer.from("BULLETIN-BACKUP-V1\n", "utf8");
const IV_BYTES = 12;
const TAG_BYTES = 16;

export function parseBackupEncryptionKey(value: string) {
  const key = Buffer.from(value, "base64url");
  if (key.length !== 32) throw new Error("backup-encryption-key-must-be-32-bytes");
  return key;
}

export function encryptBackup(plaintext: Buffer, key: Buffer, iv = randomBytes(IV_BYTES)) {
  if (key.length !== 32 || iv.length !== IV_BYTES) throw new Error("invalid-backup-encryption-input");
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(MAGIC);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), ciphertext]);
}

export function decryptBackup(payload: Buffer, key: Buffer) {
  if (key.length !== 32 || payload.length < MAGIC.length + IV_BYTES + TAG_BYTES) {
    throw new Error("invalid-encrypted-backup");
  }
  if (!payload.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error("unknown-backup-format");
  const ivStart = MAGIC.length;
  const tagStart = ivStart + IV_BYTES;
  const dataStart = tagStart + TAG_BYTES;
  const decipher = createDecipheriv("aes-256-gcm", key, payload.subarray(ivStart, tagStart));
  decipher.setAAD(MAGIC);
  decipher.setAuthTag(payload.subarray(tagStart, dataStart));
  return Buffer.concat([decipher.update(payload.subarray(dataStart)), decipher.final()]);
}

export function sha256Hex(value: Buffer) {
  return createHash("sha256").update(value).digest("hex");
}
