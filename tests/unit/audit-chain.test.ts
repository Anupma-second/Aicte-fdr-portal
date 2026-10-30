import { describe, expect, it } from "vitest";
import {
  GENESIS_HASH,
  canonicalJson,
  computeAuditHash,
  verifyEntries,
  type HashedAuditFields,
  type StoredAuditEntry,
} from "@/lib/audit/chain";

function buildChain(length: number): StoredAuditEntry[] {
  const entries: StoredAuditEntry[] = [];
  let prevHash = GENESIS_HASH;
  for (let index = 0; index < length; index += 1) {
    const fields: HashedAuditFields = {
      occurredAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)),
      actorId: "user-1",
      actorLabel: "officer@demo.test",
      action: "FDR_VERIFIED",
      entityType: "Fdr",
      entityId: `fdr-${index}`,
      payload: canonicalJson({ index }),
      prevHash,
    };
    const hash = computeAuditHash(fields);
    entries.push({ ...fields, id: BigInt(index + 1), hash });
    prevHash = hash;
  }
  return entries;
}

describe("audit hash chain", () => {
  it("verifies an untouched chain", () => {
    expect(verifyEntries(buildChain(5)).result).toEqual({ ok: true, checked: 5 });
  });

  it("verifies an empty chain", () => {
    expect(verifyEntries([]).result).toEqual({ ok: true, checked: 0 });
  });

  it("detects an edited payload", () => {
    const chain = buildChain(5);
    chain[2].payload = canonicalJson({ index: 999 });
    expect(verifyEntries(chain).result).toMatchObject({ ok: false, brokenAtId: "3", reason: "HASH_MISMATCH", checked: 2 });
  });

  it("detects an edited actor", () => {
    const chain = buildChain(3);
    chain[0].actorLabel = "someone-else@demo.test";
    expect(verifyEntries(chain).result).toMatchObject({ ok: false, brokenAtId: "1", reason: "HASH_MISMATCH" });
  });

  it("detects a deleted row in the middle", () => {
    const chain = buildChain(5);
    chain.splice(2, 1);
    expect(verifyEntries(chain).result).toMatchObject({ ok: false, brokenAtId: "4", reason: "BROKEN_LINK" });
  });

  it("detects a row whose hash was recalculated, because the next link breaks", () => {
    const chain = buildChain(4);
    chain[1].payload = canonicalJson({ forged: true });
    chain[1].hash = computeAuditHash(chain[1]);
    expect(verifyEntries(chain).result).toMatchObject({ ok: false, brokenAtId: "3", reason: "BROKEN_LINK" });
  });

  it("continues correctly across batches", () => {
    const chain = buildChain(6);
    const first = verifyEntries(chain.slice(0, 3));
    expect(verifyEntries(chain.slice(3), first.lastHash).result).toEqual({ ok: true, checked: 3 });
  });

  it("canonicalises object key order at every depth", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(canonicalJson({ a: { c: 3, d: 2 }, b: 1 }));
  });
});
