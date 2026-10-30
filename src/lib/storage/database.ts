import { db } from "@/lib/db";
import { decrypt, encrypt, sha256Hex } from "./crypto";
import type { StorageProvider, StoredFileMeta } from "./types";

/**
 * Keeps encrypted files in MySQL, for hosts whose disk is wiped on restart.
 * Only ciphertext reaches the database. The key stays in the environment.
 */
export class DatabaseStorageProvider implements StorageProvider {
  constructor(private readonly hexKey: string) {}

  async put(storageKey: string, plaintext: Buffer): Promise<StoredFileMeta> {
    const { ciphertext, iv, authTag } = encrypt(plaintext, this.hexKey);
    const data = new Uint8Array(ciphertext);
    await db.storedFile.upsert({ where: { key: storageKey }, create: { key: storageKey, data }, update: { data } });
    return { storageKey, iv, authTag, sha256: sha256Hex(plaintext), sizeBytes: plaintext.length };
  }

  async get(meta: Pick<StoredFileMeta, "storageKey" | "iv" | "authTag">): Promise<Buffer> {
    const row = await db.storedFile.findUniqueOrThrow({ where: { key: meta.storageKey } });
    return decrypt({ ciphertext: Buffer.from(row.data), iv: meta.iv, authTag: meta.authTag }, this.hexKey);
  }

  async delete(storageKey: string): Promise<void> {
    await db.storedFile.deleteMany({ where: { key: storageKey } });
  }
}
