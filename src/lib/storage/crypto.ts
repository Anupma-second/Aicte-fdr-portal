import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

export type EncryptedPayload = {
  ciphertext: Buffer;
  iv: string;
  authTag: string;
};

function keyBuffer(hexKey: string): Buffer {
  const key = Buffer.from(hexKey, "hex");
  if (key.length !== 32) throw new Error("Encryption key must be 32 bytes (64 hex characters)");
  return key;
}

export function encrypt(plaintext: Buffer, hexKey: string): EncryptedPayload {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, keyBuffer(hexKey), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { ciphertext, iv: iv.toString("hex"), authTag: cipher.getAuthTag().toString("hex") };
}

/** Throws if the ciphertext or auth tag was altered, or the key is wrong. */
export function decrypt(payload: EncryptedPayload, hexKey: string): Buffer {
  const decipher = createDecipheriv(ALGORITHM, keyBuffer(hexKey), Buffer.from(payload.iv, "hex"));
  decipher.setAuthTag(Buffer.from(payload.authTag, "hex"));
  return Buffer.concat([decipher.update(payload.ciphertext), decipher.final()]);
}

export function sha256Hex(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}
