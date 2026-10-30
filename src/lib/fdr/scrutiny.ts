import type { FdrEventType, FdrStatus, Prisma } from "@prisma/client";
import { appendAudit } from "@/lib/audit/chain";
import type { SessionUser } from "@/lib/auth/session";
import { getBankVerificationService } from "@/lib/bank";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import type { ScrutinyActionInput } from "@/lib/validation/scrutiny";
import { notifyInstitution } from "@/lib/notifications";
import { encodeText } from "@/lib/notifications/format";
import { daysUntil } from "./dates";
import { availableActions, type ScrutinyState } from "./scrutiny-rules";
import { recomputeRisk, returnToScrutinyIfAnswered, syncDiscrepancies } from "./service";
import { assertTransition, type FdrActor } from "./status-machine";

type Tx = Prisma.TransactionClient;
type Actor = SessionUser;

const EXPIRING_WITHIN_DAYS = 90;
const TRANSACTION_OPTIONS = { timeout: 15_000 };

function auditActor(user: Actor) {
  return { actorId: user.id, actorLabel: user.email };
}

export async function loadScrutinyState(tx: Tx, fdrId: string, officerId: string): Promise<ScrutinyState> {
  const fdr = await tx.fdr.findUnique({
    where: { id: fdrId },
    select: {
      status: true,
      trustLevel: true,
      assignedOfficerId: true,
      documents: { where: { type: "FDR_SCAN", isCurrent: true }, select: { id: true } },
      discrepancies: { select: { status: true } },
    },
  });
  if (!fdr) throw new ApiError(404, "NOT_FOUND", "FDR not found");
  return {
    status: fdr.status,
    trustLevel: fdr.trustLevel,
    hasCurrentScan: fdr.documents.length > 0,
    openDiscrepancies: fdr.discrepancies.filter((item) => item.status === "OPEN").length,
    unresolvedDiscrepancies: fdr.discrepancies.filter((item) => item.status === "OPEN" || item.status === "RESPONDED").length,
    assignedToSomeoneElse: fdr.assignedOfficerId !== null && fdr.assignedOfficerId !== officerId,
  };
}

/** Every officer-driven status change comes through here, so none can skip the status machine. */
export async function changeStatus(
  tx: Tx,
  fdrId: string,
  from: FdrStatus,
  to: FdrStatus,
  actor: FdrActor,
  user: Actor | null,
  eventType: FdrEventType = "STATUS_CHANGED",
  extra: Prisma.FdrUpdateInput = {},
) {
  assertTransition(from, to, actor);
  await tx.fdr.update({ where: { id: fdrId }, data: { ...extra, status: to, statusChangedAt: new Date() } });
  await tx.fdrEvent.create({
    data: { fdrId, type: eventType, title: `Status changed to ${to}`, metadata: { from, to }, actorId: user?.id },
  });
  await appendAudit(tx, {
    ...(user ? auditActor(user) : { actorId: null, actorLabel: "system" }),
    action: "FDR_STATUS_CHANGED",
    entityType: "Fdr",
    entityId: fdrId,
    payload: { from, to },
  });
}

/** Moves an active FDR to the status its dates call for. The daily job reuses this. */
export async function applyDateStatus(tx: Tx, fdrId: string, now = new Date()) {
  const fdr = await tx.fdr.findUniqueOrThrow({ where: { id: fdrId }, select: { status: true, maturityDate: true } });
  const days = daysUntil(fdr.maturityDate, now);
  if (fdr.status === "ACTIVE" && days >= 0 && days <= EXPIRING_WITHIN_DAYS) {
    await changeStatus(tx, fdrId, "ACTIVE", "EXPIRING", "SYSTEM", null);
  } else if ((fdr.status === "ACTIVE" || fdr.status === "EXPIRING") && days < 0) {
    await changeStatus(tx, fdrId, fdr.status, "MATURED", "SYSTEM", null);
  }
}

async function raiseOfficerDiscrepancy(tx: Tx, user: Actor, fdrId: string, severity: "LOW" | "MEDIUM" | "HIGH", message: string, extra: { declaredValue?: string; extractedValue?: string } = {}) {
  const created = await tx.discrepancy.create({
    data: { fdrId, type: "OTHER", severity, source: "OFFICER", message, raisedById: user.id, ...extra },
  });
  await tx.fdrEvent.create({ data: { fdrId, type: "DISCREPANCY_RAISED", title: "Discrepancy raised by officer", detail: message, actorId: user.id } });
  await appendAudit(tx, { ...auditActor(user), action: "DISCREPANCY_RAISED", entityType: "Discrepancy", entityId: created.id, payload: { fdrId, severity, message } });
}

async function closeDiscrepancy(tx: Tx, user: Actor, fdrId: string, discrepancyId: string, note: string) {
  const item = await tx.discrepancy.findFirst({ where: { id: discrepancyId, fdrId } });
  if (!item) throw new ApiError(404, "NOT_FOUND", "Discrepancy not found");
  if (item.status !== "OPEN" && item.status !== "RESPONDED") throw new ApiError(409, "ALREADY_CLOSED", "This discrepancy is already closed");

  // An automatic check that still fails can only be accepted, not marked as fixed. Fixing it clears it by itself.
  const status = item.source === "SYSTEM" ? "WAIVED" : "RESOLVED";
  await tx.discrepancy.update({ where: { id: discrepancyId }, data: { status, resolvedById: user.id, resolvedAt: new Date() } });
  await tx.fdrEvent.create({
    data: { fdrId, type: "DISCREPANCY_RESOLVED", title: `Discrepancy ${status.toLowerCase()} by officer`, detail: note, actorId: user.id, metadata: { type: item.type, status } },
  });
  await appendAudit(tx, { ...auditActor(user), action: `DISCREPANCY_${status}`, entityType: "Discrepancy", entityId: discrepancyId, payload: { fdrId, note } });
  await returnToScrutinyIfAnswered(tx, fdrId, user);
}

async function bankVerify(tx: Tx, user: Actor, fdrId: string) {
  const fdr = await tx.fdr.findUniqueOrThrow({ where: { id: fdrId } });
  const service = getBankVerificationService();
  const response = await service.verify({
    fdrNumber: fdr.fdrNumber,
    bankName: fdr.bankName,
    amount: fdr.amount.toString(),
    maturityDate: fdr.maturityDate,
  });

  await tx.bankVerificationLog.create({
    data: {
      fdrId,
      adapter: service.adapterName,
      result: response.result,
      confirmedAmount: response.confirmedAmount,
      confirmedMaturityDate: response.confirmedMaturityDate,
      responsePayload: { simulated: service.adapterName === "mock" },
      requestedById: user.id,
    },
  });
  await tx.fdrEvent.create({
    data: { fdrId, type: "BANK_VERIFICATION", title: `Bank verification: ${response.result}`, metadata: { result: response.result, adapter: service.adapterName }, actorId: user.id },
  });
  await appendAudit(tx, {
    ...auditActor(user),
    action: "BANK_VERIFICATION",
    entityType: "Fdr",
    entityId: fdrId,
    payload: { adapter: service.adapterName, result: response.result, confirmedAmount: response.confirmedAmount },
  });

  if (response.result === "CONFIRMED") {
    await tx.fdr.update({ where: { id: fdrId }, data: { trustLevel: "BANK_CONFIRMED" } });
    return response.result;
  }

  // A bank that no longer agrees takes the top badge away. Declared values stay untouched.
  if (fdr.trustLevel === "BANK_CONFIRMED") {
    await tx.fdr.update({ where: { id: fdrId }, data: { trustLevel: "DOCUMENT_VERIFIED" } });
  }
  await raiseOfficerDiscrepancy(
    tx,
    user,
    fdrId,
    "HIGH",
    encodeText(response.result === "NOT_FOUND" ? "BANK_NOT_FOUND" : "BANK_MISMATCH", {}),
    { declaredValue: fdr.amount.toString(), extractedValue: response.confirmedAmount ?? undefined },
  );
  if (fdr.status === "UNDER_SCRUTINY") await changeStatus(tx, fdrId, "UNDER_SCRUTINY", "DISCREPANCY_RAISED", "SCRUTINY_OFFICER", user);
  return response.result;
}

async function linkSuccessor(tx: Tx, user: Actor, fdrId: string, type: "RENEWAL" | "REPLACEMENT", reference: string) {
  const old = await tx.fdr.findUniqueOrThrow({ where: { id: fdrId } });
  const successor = await tx.fdr.findUnique({
    where: { referenceNo: reference },
    include: { renewedFrom: { select: { id: true } }, renewedTo: { select: { id: true } } },
  });
  // Same institution only, so one institution's deposit can't be linked to another's.
  if (!successor || successor.institutionId !== old.institutionId) throw new ApiError(404, "SUCCESSOR_NOT_FOUND", "No FDR with that reference at this institution");
  if (successor.id === old.id) throw new ApiError(400, "SUCCESSOR_SAME", "An FDR can't succeed itself");
  if (successor.renewedFrom || successor.renewedTo) throw new ApiError(409, "SUCCESSOR_LINKED", "That FDR is already part of a renewal chain");
  if (successor.maturityDate <= old.maturityDate) throw new ApiError(400, "SUCCESSOR_OLDER", "The new FDR must mature after the old one");
  if (["RENEWED", "REPLACED", "RELEASED", "CLOSED"].includes(successor.status)) throw new ApiError(409, "SUCCESSOR_FINISHED", "That FDR has already finished");

  const to = type === "RENEWAL" ? "RENEWED" : "REPLACED";
  await tx.renewalLink.create({ data: { oldFdrId: old.id, newFdrId: successor.id, type } });
  await changeStatus(tx, old.id, old.status, to, "SCRUTINY_OFFICER", user, to);
  await tx.fdrEvent.create({
    data: { fdrId: successor.id, type: "SUBMITTED", title: `Linked as successor of ${old.referenceNo}`, detail: old.referenceNo, metadata: { predecessor: old.referenceNo }, actorId: user.id },
  });
  await appendAudit(tx, {
    ...auditActor(user),
    action: "RENEWAL_LINKED",
    entityType: "Fdr",
    entityId: old.id,
    payload: { type, successor: successor.referenceNo, old: old.referenceNo },
  });
}

/** The only entry point for officer actions. Rules are checked here, not just hidden on screen. */
export async function performScrutinyAction(user: Actor, fdrId: string, input: ScrutinyActionInput) {
  return db.$transaction(async (tx) => {
    const state = await loadScrutinyState(tx, fdrId, user.id);
    if (state.assignedToSomeoneElse) throw new ApiError(403, "ASSIGNED_ELSEWHERE", "This case is assigned to another officer");
    if (!availableActions(state).includes(input.action)) {
      throw new ApiError(409, "ACTION_NOT_AVAILABLE", "This action isn't available at this stage");
    }

    let result: string | undefined;
    switch (input.action) {
      case "START":
        await changeStatus(tx, fdrId, "SUBMITTED", "UNDER_SCRUTINY", "SCRUTINY_OFFICER", user, "STATUS_CHANGED", {
          assignedOfficer: { connect: { id: user.id } },
        });
        break;
      case "OBSERVE": {
        const observation = await tx.scrutinyObservation.create({ data: { fdrId, officerId: user.id, note: input.note } });
        await tx.fdrEvent.create({ data: { fdrId, type: "OBSERVATION_ADDED", title: "Scrutiny observation added", actorId: user.id } });
        await appendAudit(tx, { ...auditActor(user), action: "OBSERVATION_ADDED", entityType: "ScrutinyObservation", entityId: observation.id, payload: { fdrId, note: input.note } });
        // Observations change nothing the checks look at.
        return { ok: true };
      }
      case "RAISE":
        await raiseOfficerDiscrepancy(tx, user, fdrId, input.severity, input.message);
        if (state.status === "UNDER_SCRUTINY") await changeStatus(tx, fdrId, "UNDER_SCRUTINY", "DISCREPANCY_RAISED", "SCRUTINY_OFFICER", user);
        await notifyInstitution(tx, fdrId, "DISCREPANCY");
        break;
      case "SEND_BACK":
        await changeStatus(tx, fdrId, "UNDER_SCRUTINY", "DISCREPANCY_RAISED", "SCRUTINY_OFFICER", user);
        await notifyInstitution(tx, fdrId, "DISCREPANCY");
        break;
      case "CLOSE_DISCREPANCY":
        await closeDiscrepancy(tx, user, fdrId, input.discrepancyId, input.note);
        break;
      case "VERIFY_DOCUMENTS":
        await tx.fdr.update({ where: { id: fdrId }, data: { trustLevel: "DOCUMENT_VERIFIED" } });
        await tx.fdrEvent.create({ data: { fdrId, type: "VERIFIED", title: "Documents checked by officer", metadata: { documents: true }, actorId: user.id } });
        await appendAudit(tx, { ...auditActor(user), action: "DOCUMENTS_VERIFIED", entityType: "Fdr", entityId: fdrId, payload: { trustLevel: "DOCUMENT_VERIFIED" } });
        break;
      case "BANK_VERIFY":
        result = await bankVerify(tx, user, fdrId);
        break;
      case "APPROVE":
        await changeStatus(tx, fdrId, "UNDER_SCRUTINY", "VERIFIED", "SCRUTINY_OFFICER", user, "VERIFIED", { verifiedAt: new Date(), slaDueAt: null });
        break;
      case "ACTIVATE":
        await changeStatus(tx, fdrId, "VERIFIED", "ACTIVE", "SCRUTINY_OFFICER", user);
        await applyDateStatus(tx, fdrId);
        break;
      case "LINK_SUCCESSOR":
        await linkSuccessor(tx, user, fdrId, input.type, input.successorReference);
        break;
      case "CLOSE":
        await changeStatus(tx, fdrId, state.status, "CLOSED", "SCRUTINY_OFFICER", user, "CLOSED");
        break;
    }

    await syncDiscrepancies(tx, fdrId, user);
    await recomputeRisk(tx, fdrId);
    return { ok: true, result };
  }, TRANSACTION_OPTIONS);
}
