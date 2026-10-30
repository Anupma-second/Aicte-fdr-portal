import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { decrypt, encrypt, sha256Hex } from "./crypto";
import type { StorageProvider, StoredFileMeta } from "./types";

export class LocalStorageProvider implements StorageProvider {
  private readonly root: string;

  constructor(
    rootDir: string,
    private readonly hexKey: string,
  ) {
    this.root = path.resolve(rootDir);
  }

  private resolve(storageKey: string): string {
    const full = path.resolve(this.root, storageKey);
    if (!full.startsWith(this.root + path.sep)) throw new Error("Invalid storage key");
    return full;
  }

  async put(storageKey: string, plaintext: Buffer): Promise<StoredFileMeta> {
    const full = this.resolve(storageKey);
    const { ciphertext, iv, authTag } = encrypt(plaintext, this.hexKey);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, ciphertext);
    return { storageKey, iv, authTag, sha256: sha256Hex(plaintext), sizeBytes: plaintext.length };
  }

  async get(meta: Pick<StoredFileMeta, "storageKey" | "iv" | "authTag">): Promise<Buffer> {
    const ciphertext = await readFile(this.resolve(meta.storageKey));
    return decrypt({ ciphertext, iv: meta.iv, authTag: meta.authTag }, this.hexKey);
  }

  async delete(storageKey: string): Promise<void> {
    await rm(this.resolve(storageKey), { force: true });
  }
}
