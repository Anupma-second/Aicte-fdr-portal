import { NextResponse, type NextRequest } from "next/server";
import { appendAudit } from "@/lib/audit/chain";
import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { ApiError, handler } from "@/lib/errors";
import { updateAlertRuleSchema } from "@/lib/validation/alerts";

/** Rules are switched off rather than deleted, so the escalation history keeps pointing at them. */
export const PATCH = handler(async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
  const admin = await requireRole("ADMIN");
  const { id } = await context.params;
  const { isActive } = updateAlertRuleSchema.parse(await request.json());

  await db.$transaction(async (tx) => {
    const rule = await tx.alertRule.findUnique({ where: { id } });
    if (!rule) throw new ApiError(404, "NOT_FOUND", "Rule not found");
    await tx.alertRule.update({ where: { id }, data: { isActive, updatedById: admin.id } });
    await appendAudit(tx, { actorId: admin.id, actorLabel: admin.email, action: "ALERT_RULE_CHANGED", entityType: "AlertRule", entityId: id, payload: { from: rule.isActive, to: isActive } });
  });
  return NextResponse.json({ ok: true });
});
