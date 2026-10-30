export type StoredFileMeta = {
  storageKey: string;
  iv: string;
  authTag: string;
  sha256: string;
  sizeBytes: number;
};

/** Swap the implementation (for example to S3) without touching callers. */
export interface StorageProvider {
  put(storageKey: string, plaintext: Buffer): Promise<StoredFileMeta>;
  get(meta: Pick<StoredFileMeta, "storageKey" | "iv" | "authTag">): Promise<Buffer>;
  delete(storageKey: string): Promise<void>;
}
