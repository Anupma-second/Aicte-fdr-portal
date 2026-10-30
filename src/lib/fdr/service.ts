import { randomUUID } from "node:crypto";
import { Prisma, type DocumentType, type FdrStatus } from "@prisma/client";
import { appendAudit } from "@/lib/audit/chain";
import type { SessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { analyzeScan, readAnalysisToken, type ScanAnalysis } from "@/lib/ocr/analyze";
import { getStorage, type StoredFileMeta } from "@/lib/storage";
import { sha256Hex } from "@/lib/storage/crypto";
import { toUtcDate, type FdrInput } from "@/lib/validation/fdr";
import { isoDate } from "./compare";
import { addDays, daysUntil } from "./dates";
import { detectDiscrepancies } from "./discrepancy";
import { computeRisk } from "./risk";
import { assertTransition } from "./status-machine";
import type { CheckedUpload } from "./uploads";

const SLA_DAYS = 14;
const TRANSACTION_OPTIONS = { timeout: 15_000 };
/** A declared detail can be corrected only until an officer has taken the case up, or when asked to. */
const EDITABLE: FdrStatus[] = ["SUBMITTED", "DISCREPANCY_RAISED"];
/** Once verified, the scan on record is what was verified against. */
const SCAN_REPLACEABLE: FdrStatus[] = ["SUBMITTED", "UNDER_SCRUTINY", "DISCREPANCY_RAISED"];

type Tx = Prisma.TransactionClient;
type StoredUpload = { upload: CheckedUpload; meta: StoredFileMeta };

export function canEditFdr(status: FdrStatus): boolean {
  return EDITABLE.includes(status);
}

export function canUploadDocument(status: FdrStatus, type: DocumentType): boolean {
  if (status === "CLOSED") return false;
  return type !== "FDR_SCAN" || SCAN_REPLACEABLE.includes(status);
}

function actorOf(user: SessionUser) {
  return { actorId: user.id, actorLabel: user.email };
}

function isUniqueError(error: unknown, field: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    JSON.stringify(error.meta ?? {}).includes(field)
  );
}

async function storeUpload(upload: CheckedUpload): Promise<StoredUpload> {
  const now = new Date();
  const key = `documents/${now.getUTCFullYear()}/${randomUUID()}.enc`;
  return { upload, meta: await getStorage().put(key, upload.buffer) };
}

async function nextReferenceNo(tx: Tx): Promise<string> {
  const prefix = `FDR-${new Date().getUTCFullYear()}-`;
  const last = await tx.fdr.findFirst({
    where: { referenceNo: { startsWith: prefix } },
    orderBy: { referenceNo: "desc" },
    select: { referenceNo: true },
  });
  const next = last ? Number(last.referenceNo.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(next).padStart(6, "0")}`;
}

/** New versions never overwrite old ones. The newest is simply marked current. */
async function recordDocument(
  tx: Tx,
  fdrId: string,
  type: DocumentType,
  stored: StoredUpload,
  userId: string,
  analysis: ScanAnalysis | null,
) {
  const previous = await tx.fdrDocument.findFirst({ where: { fdrId, type }, orderBy: { version: "desc" } });
  if (previous) {
    await tx.fdrDocument.updateMany({ where: { fdrId, type, isCurrent: true }, data: { isCurrent: false } });
  }
  const document = await tx.fdrDocument.create({
    data: {
      fdrId,
      type,
      version: (previous?.version ?? 0) + 1,
      originalName: stored.upload.originalName,
      mimeType: stored.upload.mimeType,
      uploadedById: userId,
      ...stored.meta,
    },
  });
  await tx.fdrEvent.create({
    data: {
      fdrId,
      type: "DOCUMENT_UPLOADED",
      title: `${type} version ${document.version} uploaded`,
      metadata: { type, version: document.version },
      actorId: userId,
    },
  });

  if (analysis) {
    const fields = analysis.fields;
    await tx.ocrExtraction.create({
      data: {
        documentId: document.id,
        status: analysis.status,
        rawText: analysis.rawText,
        confidence: analysis.confidence,
        fdrNumber: fields?.fdrNumber?.slice(0, 40),
        bankName: fields?.bankName?.slice(0, 120),
        branchName: fields?.branchName?.slice(0, 120),
        amount: fields?.amount,
        issueDate: fields?.issueDate ? toUtcDate(fields.issueDate) : null,
        maturityDate: fields?.maturityDate ? toUtcDate(fields.maturityDate) : null,
      },
    });
    await tx.fdrEvent.create({
      data: {
        fdrId,
        type: "OCR_RUN",
        title: analysis.status === "COMPLETED" ? "OCR extraction completed" : "OCR could not read the document",
        metadata: { status: analysis.status },
      },
    });
  }
  return document;
}

export async function recomputeRisk(tx: Tx, fdrId: string, now = new Date()) {
  const fdr = await tx.fdr.findUniqueOrThrow({
    where: { id: fdrId },
    select: {
      status: true,
      maturityDate: true,
      documents: { where: { type: "FDR_SCAN", isCurrent: true }, select: { id: true } },
      discrepancies: { select: { status: true } },
      _count: { select: { escalations: true } },
    },
  });
  const risk = computeRisk({
    status: fdr.status,
    daysToMaturity: daysUntil(fdr.maturityDate, now),
    missingDocuments: fdr.documents.length === 0 ? 1 : 0,
    pastDelays: fdr._count.escalations,
    openDiscrepancies: fdr.discrepancies.filter((item) => item.status === "OPEN" || item.status === "RESPONDED").length,
    resolvedDiscrepancies: fdr.discrepancies.filter((item) => item.status === "RESOLVED").length,
  });
  await tx.fdr.update({
    where: { id: fdrId },
    data: { riskScore: risk.score, riskLevel: risk.level, riskReasons: risk.reasons as unknown as Prisma.InputJsonValue },
  });
}

/** Re-runs the automatic checks: raises what's newly wrong and resolves what has been fixed. */
export async function syncDiscrepancies(tx: Tx, fdrId: string, actor: SessionUser | null) {
  const fdr = await tx.fdr.findUniqueOrThrow({
    where: { id: fdrId },
    include: {
      documents: { where: { type: "FDR_SCAN", isCurrent: true }, include: { ocr: true } },
      discrepancies: { where: { source: "SYSTEM", status: { in: ["OPEN", "RESPONDED", "WAIVED"] } } },
    },
  });
  const unresolved = fdr.discrepancies.filter((item) => item.status !== "WAIVED");
  // An officer who accepted a finding has decided it. Don't raise it again on the next run.
  const waivedTypes = fdr.discrepancies.filter((item) => item.status === "WAIVED").map((item) => item.type);
  const duplicate = await tx.fdr.findFirst({
    where: { fdrNumber: fdr.fdrNumber, institutionId: { not: fdr.institutionId } },
    select: { id: true },
  });
  const ocr = fdr.documents[0]?.ocr ?? null;
  const detected = detectDiscrepancies({
    amount: fdr.amount.toString(),
    bankName: fdr.bankName,
    issueDate: fdr.issueDate,
    maturityDate: fdr.maturityDate,
    ifscCode: fdr.ifscCode,
    hasCurrentScan: fdr.documents.length > 0,
    ocr: ocr?.status === "COMPLETED" ? { amount: ocr.amount?.toString() ?? null, bankName: ocr.bankName } : null,
    duplicateElsewhere: Boolean(duplicate),
  });
  const auditActor = actor ? actorOf(actor) : { actorId: null, actorLabel: "system" };

  for (const item of detected.filter((found) => !unresolved.some((open) => open.type === found.type) && !waivedTypes.includes(found.type))) {
    const created = await tx.discrepancy.create({ data: { fdrId, source: "SYSTEM", ...item } });
    await tx.fdrEvent.create({ data: { fdrId, type: "DISCREPANCY_RAISED", title: item.message, metadata: { type: item.type } } });
    await appendAudit(tx, { ...auditActor, action: "DISCREPANCY_RAISED", entityType: "Discrepancy", entityId: created.id, payload: { fdrId, type: item.type } });
  }
  for (const open of unresolved.filter((item) => !detected.some((found) => found.type === item.type))) {
    await tx.discrepancy.update({ where: { id: open.id }, data: { status: "RESOLVED", resolvedAt: new Date(), resolvedById: actor?.id } });
    await tx.fdrEvent.create({ data: { fdrId, type: "DISCREPANCY_RESOLVED", title: `${open.type} no longer applies`, metadata: { type: open.type } } });
    await appendAudit(tx, { ...auditActor, action: "DISCREPANCY_AUTO_RESOLVED", entityType: "Discrepancy", entityId: open.id, payload: { fdrId, type: open.type } });
  }
  await returnToScrutinyIfAnswered(tx, fdrId, actor);
  await recomputeRisk(tx, fdrId);
}

/** An FDR waiting on the institution goes back to the officer once nothing is left unanswered. */
export async function returnToScrutinyIfAnswered(tx: Tx, fdrId: string, actor: SessionUser | null) {
  const fdr = await tx.fdr.findUniqueOrThrow({ where: { id: fdrId }, select: { status: true } });
  if (fdr.status !== "DISCREPANCY_RAISED") return;
  const open = await tx.discrepancy.count({ where: { fdrId, status: "OPEN" } });
  if (open > 0) return;

  assertTransition("DISCREPANCY_RAISED", "UNDER_SCRUTINY", "INSTITUTION");
  await tx.fdr.update({ where: { id: fdrId }, data: { status: "UNDER_SCRUTINY", statusChangedAt: new Date() } });
  await tx.fdrEvent.create({
    data: { fdrId, type: "STATUS_CHANGED", title: "Returned to scrutiny", metadata: { to: "UNDER_SCRUTINY" }, actorId: actor?.id },
  });
  await appendAudit(tx, {
    ...(actor ? actorOf(actor) : { actorId: null, actorLabel: "system" }),
    action: "FDR_STATUS_CHANGED",
    entityType: "Fdr",
    entityId: fdrId,
    payload: { from: "DISCREPANCY_RAISED", to: "UNDER_SCRUTINY" },
  });
}

/** Loads an FDR the institution user owns. A missing FDR and someone else's look the same: 404. */
export async function loadOwnFdr(tx: Tx, user: SessionUser, fdrId: string) {
  const fdr = await tx.fdr.findFirst({ where: { id: fdrId, institutionId: user.institutionId ?? "__none__" } });
  if (!fdr) throw new ApiError(404, "NOT_FOUND", "FDR not found");
  return fdr;
}

export async function createFdr(user: SessionUser, input: FdrInput, scan: CheckedUpload | null, ocrToken: string | null) {
  if (!user.institutionId) throw new ApiError(403, "NO_INSTITUTION", "Your account isn't linked to an institution");
  const institutionId = user.institutionId;

  const existing = await db.fdr.findUnique({
    where: { institutionId_fdrNumber: { institutionId, fdrNumber: input.fdrNumber } },
    select: { id: true },
  });
  if (existing) throw new ApiError(409, "DUPLICATE_OWN_FDR", "Your institution has already submitted this FDR number");

  let analysis: ScanAnalysis | null = null;
  let stored: StoredUpload | null = null;
  if (scan) {
    analysis = (await readAnalysisToken(ocrToken, sha256Hex(scan.buffer))) ?? (await analyzeScan(scan.buffer, scan.mimeType));
    stored = await storeUpload(scan);
  }

  const now = new Date();
  // Two people submitting at once can pick the same reference. Unique index catches it, so retry.
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await db.$transaction(async (tx) => {
        const fdr = await tx.fdr.create({
          data: {
            referenceNo: await nextReferenceNo(tx),
            fdrNumber: input.fdrNumber,
            institutionId,
            bankName: input.bankName,
            branchName: input.branchName,
            ifscCode: input.ifscCode,
            amount: input.amount,
            issueDate: toUtcDate(input.issueDate),
            maturityDate: toUtcDate(input.maturityDate),
            status: "SUBMITTED",
            trustLevel: "SELF_DECLARED",
            submittedById: user.id,
            submittedAt: now,
            statusChangedAt: now,
            slaDueAt: addDays(now, SLA_DAYS),
          },
        });
        await tx.fdrEvent.create({ data: { fdrId: fdr.id, type: "SUBMITTED", title: "FDR submitted", actorId: user.id } });
        if (stored) await recordDocument(tx, fdr.id, "FDR_SCAN", stored, user.id, analysis);
        await appendAudit(tx, {
          ...actorOf(user),
          action: "FDR_SUBMITTED",
          entityType: "Fdr",
          entityId: fdr.id,
          payload: { ...input, referenceNo: fdr.referenceNo, hasScan: Boolean(stored), documentSha256: stored?.meta.sha256 ?? null },
        });
        await syncDiscrepancies(tx, fdr.id, user);
        return fdr;
      }, TRANSACTION_OPTIONS);
    } catch (error) {
      if (isUniqueError(error, "referenceNo") && attempt < 3) continue;
      if (stored) await getStorage().delete(stored.meta.storageKey);
      if (isUniqueError(error, "fdrNumber")) {
        throw new ApiError(409, "DUPLICATE_OWN_FDR", "Your institution has already submitted this FDR number");
      }
      throw error;
    }
  }
}

export async function updateFdr(user: SessionUser, fdrId: string, input: FdrInput) {
  try {
    return await db.$transaction(async (tx) => {
      const fdr = await loadOwnFdr(tx, user, fdrId);
      if (!canEditFdr(fdr.status)) throw new ApiError(409, "NOT_EDITABLE", "This FDR can no longer be edited");

      const updated = await tx.fdr.update({
        where: { id: fdrId },
        data: {
          fdrNumber: input.fdrNumber,
          bankName: input.bankName,
          branchName: input.branchName,
          ifscCode: input.ifscCode ?? null,
          amount: input.amount,
          issueDate: toUtcDate(input.issueDate),
          maturityDate: toUtcDate(input.maturityDate),
        },
      });
      await tx.fdrEvent.create({ data: { fdrId, type: "STATUS_CHANGED", title: "Declared details corrected", actorId: user.id, metadata: { edit: true } } });
      await appendAudit(tx, {
        ...actorOf(user),
        action: "FDR_DETAILS_CORRECTED",
        entityType: "Fdr",
        entityId: fdrId,
        payload: {
          before: {
            fdrNumber: fdr.fdrNumber,
            bankName: fdr.bankName,
            branchName: fdr.branchName,
            ifscCode: fdr.ifscCode,
            amount: fdr.amount.toString(),
            issueDate: isoDate(fdr.issueDate),
            maturityDate: isoDate(fdr.maturityDate),
          },
          after: input,
        },
      });
      await syncDiscrepancies(tx, fdrId, user);
      return updated;
    }, TRANSACTION_OPTIONS);
  } catch (error) {
    if (isUniqueError(error, "fdrNumber")) {
      throw new ApiError(409, "DUPLICATE_OWN_FDR", "Your institution has already submitted this FDR number");
    }
    throw error;
  }
}

export async function addDocument(user: SessionUser, fdrId: string, type: DocumentType, upload: CheckedUpload) {
  const fdr = await loadOwnFdr(db, user, fdrId);
  if (!canUploadDocument(fdr.status, type)) throw new ApiError(409, "UPLOAD_NOT_ALLOWED", "This document can't be changed at this stage");

  const analysis = type === "FDR_SCAN" ? await analyzeScan(upload.buffer, upload.mimeType) : null;
  const stored = await storeUpload(upload);
  try {
    return await db.$transaction(async (tx) => {
      const document = await recordDocument(tx, fdrId, type, stored, user.id, analysis);
      await appendAudit(tx, {
        ...actorOf(user),
        action: "DOCUMENT_UPLOADED",
        entityType: "FdrDocument",
        entityId: document.id,
        payload: { fdrId, type, version: document.version, sha256: document.sha256 },
      });
      await syncDiscrepancies(tx, fdrId, user);
      return document;
    }, TRANSACTION_OPTIONS);
  } catch (error) {
    await getStorage().delete(stored.meta.storageKey);
    throw error;
  }
}

export async function respondToDiscrepancy(user: SessionUser, fdrId: string, discrepancyId: string, response: string) {
  return db.$transaction(async (tx) => {
    await loadOwnFdr(tx, user, fdrId);
    const discrepancy = await tx.discrepancy.findFirst({ where: { id: discrepancyId, fdrId } });
    if (!discrepancy) throw new ApiError(404, "NOT_FOUND", "Discrepancy not found");
    if (discrepancy.status !== "OPEN") throw new ApiError(409, "ALREADY_ANSWERED", "This discrepancy has already been answered");

    const updated = await tx.discrepancy.update({
      where: { id: discrepancyId },
      data: { status: "RESPONDED", response, respondedAt: new Date() },
    });
    await tx.fdrEvent.create({
      data: { fdrId, type: "DISCREPANCY_RESOLVED", title: "Institution responded to a discrepancy", detail: response, actorId: user.id, metadata: { type: discrepancy.type, responded: true } },
    });
    await appendAudit(tx, {
      ...actorOf(user),
      action: "DISCREPANCY_RESPONDED",
      entityType: "Discrepancy",
      entityId: discrepancyId,
      payload: { fdrId, response },
    });
    await returnToScrutinyIfAnswered(tx, fdrId, user);
    await recomputeRisk(tx, fdrId);
    return updated;
  }, TRANSACTION_OPTIONS);
}
