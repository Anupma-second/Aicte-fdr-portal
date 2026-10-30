import { getEnv } from "@/lib/env";
import { DatabaseStorageProvider } from "./database";
import { LocalStorageProvider } from "./local";
import type { StorageProvider } from "./types";

export type { StorageProvider, StoredFileMeta } from "./types";

let provider: StorageProvider | undefined;

export function getStorage(): StorageProvider {
  if (!provider) {
    const env = getEnv();
    provider =
      env.STORAGE_DRIVER === "database"
        ? new DatabaseStorageProvider(env.FILE_ENCRYPTION_KEY)
        : new LocalStorageProvider(env.UPLOAD_DIR, env.FILE_ENCRYPTION_KEY);
  }
  return provider;
}
