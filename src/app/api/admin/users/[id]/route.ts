import { NextResponse, type NextRequest } from "next/server";
import { appendAudit } from "@/lib/audit/chain";
import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { ApiError, handler } from "@/lib/errors";
import { notify } from "@/lib/notifications";
import { adminUpdateUserSchema } from "@/lib/validation/auth";

export const PATCH = handler(async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
  const admin = await requireRole("ADMIN");
  const { id } = await context.params;
  const { status, role } = adminUpdateUserSchema.parse(await request.json());

  // Also stops the last admin being locked out, since it's always someone else's change.
  if (id === admin.id) throw new ApiError(400, "CANNOT_CHANGE_SELF", "You can't change your own account");

  const updated = await db.$transaction(async (tx) => {
    const target = await tx.user.findUnique({ where: { id } });
    if (!target) throw new ApiError(404, "NOT_FOUND", "User not found");
    if (role && target.role === "INSTITUTION") {
      throw new ApiError(400, "ROLE_NOT_CHANGEABLE", "Institution accounts can't be moved to a staff role");
    }

    const endsSession = (status !== undefined && status !== "ACTIVE") || (role !== undefined && role !== target.role);
    const user = await tx.user.update({
      where: { id },
      // Bumping tokenVersion ends any session the user already has.
      data: { status, role, tokenVersion: { increment: endsSession ? 1 : 0 } },
      select: { id: true, email: true, status: true, role: true },
    });
    await appendAudit(tx, {
      actorId: admin.id,
      actorLabel: admin.email,
      action: role && role !== target.role ? "USER_ROLE_CHANGED" : "USER_STATUS_CHANGED",
      entityType: "User",
      entityId: id,
      payload: { fromStatus: target.status, toStatus: user.status, fromRole: target.role, toRole: user.role },
    });
    if (target.status === "PENDING_APPROVAL" && status === "ACTIVE") {
      await notify(tx, { userIds: [id], kind: "ACCOUNT", textKey: "ACCOUNT_APPROVED" });
    }
    return user;
  });

  return NextResponse.json({ user: updated });
});
