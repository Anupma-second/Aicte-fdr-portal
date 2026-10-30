import { NextResponse, type NextRequest } from "next/server";
import { appendAudit } from "@/lib/audit/chain";
import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { ApiError, handler } from "@/lib/errors";
import { createAlertRuleSchema } from "@/lib/validation/alerts";

export const POST = handler(async (request: NextRequest) => {
  const admin = await requireRole("ADMIN");
  const input = createAlertRuleSchema.parse(await request.json());

  const existing = await db.alertRule.findUnique({ where: { kind_days_targetLevel: input } });
  if (existing) throw new ApiError(409, "RULE_EXISTS", "That rule already exists");

  const rule = await db.$transaction(async (tx) => {
    const created = await tx.alertRule.create({ data: { ...input, updatedById: admin.id } });
    await appendAudit(tx, { actorId: admin.id, actorLabel: admin.email, action: "ALERT_RULE_CREATED", entityType: "AlertRule", entityId: created.id, payload: input });
    return created;
  });
  return NextResponse.json({ id: rule.id }, { status: 201 });
});
