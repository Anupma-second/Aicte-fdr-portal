// Checks seeded data and the audit chain against the real database.
// Usage: npx tsx --env-file=.env tests/db-check.ts
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { verifyAuditChain } from "../src/lib/audit/chain";
import { getStorage } from "../src/lib/storage";

const db = new PrismaClient();

async function main() {
  const duplicates = await db.$queryRaw<{ fdrNumber: string; institutions: bigint }[]>`
    SELECT fdrNumber, COUNT(DISTINCT institutionId) AS institutions FROM Fdr
    GROUP BY fdrNumber HAVING institutions > 1`;
  console.log("duplicate FDR numbers across institutions:", duplicates.length);

  const byStatus = await db.fdr.groupBy({ by: ["status"], _count: { _all: true } });
  console.log("by status:", Object.fromEntries(byStatus.map((row) => [row.status, row._count._all])));
  const byRisk = await db.fdr.groupBy({ by: ["riskLevel"], _count: { _all: true } });
  console.log("by risk:", Object.fromEntries(byRisk.map((row) => [row.riskLevel, row._count._all])));

  const missingScan = await db.fdr.count({ where: { documents: { none: { type: "FDR_SCAN" } } } });
  console.log("FDRs with no scan:", missingScan);
  console.log("audit chain, untouched:", await verifyAuditChain(db));

  // Edit a real audit row directly, as an attacker with database access would, then restore it.
  const row = await db.auditLog.findFirstOrThrow({ orderBy: { id: "asc" }, skip: 20 });
  await db.auditLog.update({ where: { id: row.id }, data: { payload: '{"tampered":true}' } });
  console.log("audit chain, row edited:", await verifyAuditChain(db));
  await db.auditLog.update({ where: { id: row.id }, data: { payload: row.payload } });
  console.log("audit chain, restored:", await verifyAuditChain(db));

  const doc = await db.fdrDocument.findFirstOrThrow();
  const plain = await getStorage().get(doc);
  const onDisk = await readFile(path.resolve(process.env.UPLOAD_DIR ?? "uploads", doc.storageKey));
  console.log("sample doc decrypts to a PDF:", plain.subarray(0, 5).toString() === "%PDF-");
  console.log("sample doc on disk is not a readable PDF:", onDisk.subarray(0, 5).toString() !== "%PDF-");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
