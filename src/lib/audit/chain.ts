import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";

export const GENESIS_HASH = "0".repeat(64);

export type AuditEntryInput = {
  actorId: string | null;
  actorLabel: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  payload?: unknown;
};

/** The fields covered by the hash. */
export type HashedAuditFields = {
  occurredAt: Date;
  actorId: string | null;
  actorLabel: string;
  action: string;
  entityType: string;
  entityId: string | null;
  payload: string;
  prevHash: string;
};

export type StoredAuditEntry = HashedAuditFields & { id: bigint; hash: string };

export type ChainVerification =
  | { ok: true; checked: number }
  | { ok: false; checked: number; brokenAtId: string | null; reason: "HASH_MISMATCH" | "BROKEN_LINK" | "HEAD_MISMATCH" };

/** JSON with sorted object keys, so the same data always hashes the same. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value)) ?? "null";
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(source)
        .sort()
        .map((key) => [key, sortKeys(source[key])]),
    );
  }
  return value;
}

export function computeAuditHash(fields: HashedAuditFields): string {
  // A JSON array keeps field boundaries unambiguous, unlike plain concatenation.
  const material = JSON.stringify([
    fields.prevHash,
    fields.occurredAt.toISOString(),
    fields.actorId,
    fields.actorLabel,
    fields.action,
    fields.entityType,
    fields.entityId,
    fields.payload,
  ]);
  return createHash("sha256").update(material).digest("hex");
}

/**
 * Must be called inside the transaction that makes the change it records. The
 * head row stays locked until commit, so concurrent writers can't fork the chain.
 */
export async function appendAudit(tx: Prisma.TransactionClient, entry: AuditEntryInput) {
  await tx.$executeRaw`INSERT IGNORE INTO AuditChainHead (id, lastHash) VALUES (1, ${GENESIS_HASH})`;
  const [head] = await tx.$queryRaw<{ lastHash: string }[]>`
    SELECT lastHash FROM AuditChainHead WHERE id = 1 FOR UPDATE`;

  const fields: HashedAuditFields = {
    occurredAt: new Date(),
    actorId: entry.actorId,
    actorLabel: entry.actorLabel,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    payload: canonicalJson(entry.payload ?? {}),
    prevHash: head.lastHash,
  };
  const hash = computeAuditHash(fields);

  const created = await tx.auditLog.create({ data: { ...fields, hash } });
  await tx.auditChainHead.update({ where: { id: 1 }, data: { lastHash: hash } });
  return created;
}

/** Pure check over ordered entries. Pass `previousHash` to continue from an earlier batch. */
export function verifyEntries(
  entries: StoredAuditEntry[],
  previousHash = GENESIS_HASH,
): { result: ChainVerification; lastHash: string } {
  let expectedPrev = previousHash;
  let checked = 0;
  for (const entry of entries) {
    if (entry.prevHash !== expectedPrev) {
      return {
        lastHash: expectedPrev,
        result: { ok: false, checked, brokenAtId: entry.id.toString(), reason: "BROKEN_LINK" },
      };
    }
    if (computeAuditHash(entry) !== entry.hash) {
      return {
        lastHash: expectedPrev,
        result: { ok: false, checked, brokenAtId: entry.id.toString(), reason: "HASH_MISMATCH" },
      };
    }
    expectedPrev = entry.hash;
    checked += 1;
  }
  return { lastHash: expectedPrev, result: { ok: true, checked } };
}

/** Walks the whole chain in batches. The head check also catches deleted rows at the tail. */
export async function verifyAuditChain(db: PrismaClient, batchSize = 1000): Promise<ChainVerification> {
  let checked = 0;
  let previousHash = GENESIS_HASH;
  let cursor: bigint | undefined;

  for (;;) {
    const batch: StoredAuditEntry[] = await db.auditLog.findMany({
      orderBy: { id: "asc" },
      take: batchSize,
      ...(cursor !== undefined ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (batch.length === 0) break;

    const { result, lastHash } = verifyEntries(batch, previousHash);
    checked += result.checked;
    if (!result.ok) return { ...result, checked };

    previousHash = lastHash;
    cursor = batch[batch.length - 1].id;
  }

  const head = await db.auditChainHead.findUnique({ where: { id: 1 } });
  if ((head?.lastHash ?? GENESIS_HASH) !== previousHash) {
    return { ok: false, checked, brokenAtId: null, reason: "HEAD_MISMATCH" };
  }
  return { ok: true, checked };
}
