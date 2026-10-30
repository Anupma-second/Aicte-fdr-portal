import type { Prisma, ReleaseStatus, Role } from "@prisma/client";
import { appendAudit } from "@/lib/audit/chain";
import type { SessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { activeUsersWithRole, notify, notifyInstitution } from "@/lib/notifications";
import { daysUntil } from "./dates";
import { CAN_REQUEST_RELEASE, nextReleaseStep, releaseActions, releaseBlockers, statusAfterRejection, type ReleaseAction } from "./release-rules";
import { changeStatus } from "./scrutiny";
import { loadOwnFdr, syncDiscrepancies } from "./service";

type Tx = Prisma.TransactionClient;

const TRANSACTION_OPTIONS = { timeout: 15_000 };

function actorOf(user: SessionUser) {
  return { actorId: user.id, actorLabel: user.email };
}

export async function requestRelease(user: SessionUser, fdrId: string, reason: string) {
  return db.$transaction(async (tx) => {
    const fdr = await loadOwnFdr(tx, user, fdrId);
    if (!CAN_REQUEST_RELEASE.includes(fdr.status)) throw new ApiError(409, "RELEASE_NOT_AVAILABLE", "This FDR can't be released at this stage");

    const request = await tx.releaseRequest.create({ data: { fdrId, reason, requestedById: user.id } });
    await changeStatus(tx, fdrId, fdr.status, "RELEASE_REQUESTED", "INSTITUTION", user, "RELEASE_REQUESTED");
    await appendAudit(tx, { ...actorOf(user), action: "RELEASE_REQUESTED", entityType: "ReleaseRequest", entityId: request.id, payload: { fdrId, reason } });
    await notify(tx, {
      userIds: await activeUsersWithRole(tx, "SCRUTINY_OFFICER"),
      fdrId,
      kind: "RELEASE",
      textKey: "RELEASE_NEW",
      params: { reference: fdr.referenceNo },
      link: `/fdrs/${fdrId}`,
    });
    await syncDiscrepancies(tx, fdrId, user);
    return request;
  }, TRANSACTION_OPTIONS);
}

async function moveRequest(tx: Tx, user: SessionUser, requestId: string, fdrId: string, from: ReleaseStatus, to: ReleaseStatus, note: string | undefined, data: Prisma.ReleaseRequestUpdateInput = {}) {
  await tx.releaseRequest.update({ where: { id: requestId }, data: { ...data, status: to } });
  await tx.fdrEvent.create({
    data: { fdrId, type: "RELEASE_DECISION", title: `Release moved to ${to}`, detail: note, metadata: { from, to }, actorId: user.id },
  });
  await appendAudit(tx, { ...actorOf(user), action: "RELEASE_STEP", entityType: "ReleaseRequest", entityId: requestId, payload: { fdrId, from, to, note: note ?? null } });
}

export async function performReleaseAction(user: SessionUser, requestId: string, action: ReleaseAction, note: string | undefined) {
  return db.$transaction(async (tx) => {
    const request = await tx.releaseRequest.findUnique({
      where: { id: requestId },
      include: {
        fdr: {
          include: {
            documents: { where: { type: "RELEASE_APPLICATION", isCurrent: true }, select: { id: true } },
            discrepancies: { where: { status: { in: ["OPEN", "RESPONDED"] } }, select: { id: true } },
          },
        },
      },
    });
    if (!request) throw new ApiError(404, "NOT_FOUND", "Release request not found");
    if (!releaseActions(request.status, user.role as Role).includes(action)) {
      throw new ApiError(409, "RELEASE_ACTION_NOT_AVAILABLE", "This action isn't available at this step");
    }

    const { fdr } = request;
    const fdrId = fdr.id;

    switch (action) {
      case "ADVANCE": {
        const blockers = releaseBlockers(request.status, {
          hasApplication: fdr.documents.length > 0,
          unresolvedDiscrepancies: fdr.discrepancies.length,
        });
        if (blockers.length > 0) throw new ApiError(409, `RELEASE_BLOCKED_${blockers[0]}`, "This step isn't complete yet");
        const to = nextReleaseStep(request.status)!;
        await moveRequest(tx, user, requestId, fdrId, request.status, to, note);
        if (to === "AUTHORITY_APPROVAL") {
          await notify(tx, {
            userIds: await activeUsersWithRole(tx, "COMPETENT_AUTHORITY"),
            fdrId,
            kind: "RELEASE",
            textKey: "RELEASE_APPROVAL_NEEDED",
            params: { reference: fdr.referenceNo },
            link: `/fdrs/${fdrId}`,
          });
        }
        await notifyInstitution(tx, fdrId, "RELEASE", "RELEASE_PROGRESS");
        break;
      }
      case "APPROVE":
        await moveRequest(tx, user, requestId, fdrId, request.status, "APPROVED", note, {
          decidedBy: { connect: { id: user.id } },
          decidedAt: new Date(),
          decisionNote: note,
        });
        await changeStatus(tx, fdrId, "RELEASE_REQUESTED", "RELEASED", "COMPETENT_AUTHORITY", user, "RELEASED");
        await notifyInstitution(tx, fdrId, "RELEASE", "RELEASE_APPROVED");
        break;
      case "REJECT":
        if (!note) throw new ApiError(400, "NOTE_REQUIRED", "Give a reason for rejecting");
        await moveRequest(tx, user, requestId, fdrId, request.status, "REJECTED", note, {
          decidedBy: { connect: { id: user.id } },
          decidedAt: new Date(),
          decisionNote: note,
        });
        await changeStatus(tx, fdrId, "RELEASE_REQUESTED", statusAfterRejection(daysUntil(fdr.maturityDate)), "COMPETENT_AUTHORITY", user);
        await notifyInstitution(tx, fdrId, "RELEASE", "RELEASE_REJECTED");
        break;
      case "CLOSE":
        await moveRequest(tx, user, requestId, fdrId, request.status, "CLOSED", note, { closedAt: new Date() });
        await changeStatus(tx, fdrId, "RELEASED", "CLOSED", user.role as Role, user, "CLOSED");
        await notifyInstitution(tx, fdrId, "RELEASE", "RELEASE_CLOSED");
        break;
    }

    await syncDiscrepancies(tx, fdrId, user);
  }, TRANSACTION_OPTIONS);
}
