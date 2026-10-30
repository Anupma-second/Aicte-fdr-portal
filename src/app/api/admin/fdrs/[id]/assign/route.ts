import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { appendAudit } from "@/lib/audit/chain";
import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { ApiError, handler } from "@/lib/errors";
import { notify } from "@/lib/notifications";

const schema = z.object({ officerId: z.string().min(1).max(40) });

/** Moves a case to another officer, for example when someone is away. */
export const POST = handler(async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
  const admin = await requireRole("ADMIN");
  const { id } = await context.params;
  const { officerId } = schema.parse(await request.json());

  await db.$transaction(async (tx) => {
    const fdr = await tx.fdr.findUnique({ where: { id } });
    if (!fdr) throw new ApiError(404, "NOT_FOUND", "FDR not found");
    const officer = await tx.user.findFirst({ where: { id: officerId, role: "SCRUTINY_OFFICER", status: "ACTIVE" } });
    if (!officer) throw new ApiError(400, "NOT_AN_OFFICER", "Choose an active scrutiny officer");

    await tx.fdr.update({ where: { id }, data: { assignedOfficerId: officerId } });
    await tx.fdrEvent.create({ data: { fdrId: id, type: "STATUS_CHANGED", title: "Case reassigned", detail: officer.name, metadata: { reassigned: true }, actorId: admin.id } });
    await appendAudit(tx, { actorId: admin.id, actorLabel: admin.email, action: "FDR_REASSIGNED", entityType: "Fdr", entityId: id, payload: { from: fdr.assignedOfficerId, to: officerId } });
    await notify(tx, { userIds: [officerId], fdrId: id, kind: "SYSTEM", textKey: "CASE_ASSIGNED", params: { reference: fdr.referenceNo }, link: `/fdrs/${id}` });
  });
  return NextResponse.json({ ok: true });
});
