import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sha256Hex } from "@/lib/storage/crypto";
import { LocalStorageProvider } from "@/lib/storage/local";

const KEY = "a".repeat(64);
const OTHER_KEY = "b".repeat(64);
const SECRET_TEXT = "FDR No 12345 Amount 500000";

describe("LocalStorageProvider", () => {
  let dir: string;
  let storage: LocalStorageProvider;

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "fdr-storage-"));
    storage = new LocalStorageProvider(dir, KEY);
  });

  afterAll(() => rm(dir, { recursive: true, force: true }));

  it("round-trips a file and records its plaintext hash", async () => {
    const plain = Buffer.from(SECRET_TEXT);
    const meta = await storage.put("a/file.enc", plain);
    expect((await storage.get(meta)).toString()).toBe(SECRET_TEXT);
    expect(meta.sha256).toBe(sha256Hex(plain));
    expect(meta.sizeBytes).toBe(plain.length);
  });

  it("does not leave plaintext on disk", async () => {
    await storage.put("b/file.enc", Buffer.from(SECRET_TEXT));
    const onDisk = await readFile(path.join(dir, "b/file.enc"));
    expect(onDisk.includes(Buffer.from("FDR No"))).toBe(false);
  });

  it("uses a fresh IV for each write", async () => {
    const first = await storage.put("c/1.enc", Buffer.from(SECRET_TEXT));
    const second = await storage.put("c/2.enc", Buffer.from(SECRET_TEXT));
    expect(first.iv).not.toBe(second.iv);
  });

  it("rejects a file altered on disk", async () => {
    const meta = await storage.put("d/file.enc", Buffer.from(SECRET_TEXT));
    const full = path.join(dir, "d/file.enc");
    const bytes = await readFile(full);
    bytes[0] ^= 0xff;
    await writeFile(full, bytes);
    await expect(storage.get(meta)).rejects.toThrow();
  });

  it("rejects the wrong key", async () => {
    const meta = await storage.put("e/file.enc", Buffer.from(SECRET_TEXT));
    await expect(new LocalStorageProvider(dir, OTHER_KEY).get(meta)).rejects.toThrow();
  });

  it("refuses keys that escape the storage root", async () => {
    await expect(storage.put("../outside.enc", Buffer.from("x"))).rejects.toThrow("Invalid storage key");
  });
});
