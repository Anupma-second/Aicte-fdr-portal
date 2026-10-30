import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { ApiError, handler } from "@/lib/errors";

export const POST = handler(async (_request: NextRequest, context: { params: Promise<{ id: string }> }) => {
  const user = await requireRole();
  const { id } = await context.params;
  // Scoped by user, so nobody can touch someone else's notification.
  const { count } = await db.notification.updateMany({ where: { id, userId: user.id }, data: { readAt: new Date() } });
  if (count === 0) throw new ApiError(404, "NOT_FOUND", "Notification not found");
  return NextResponse.json({ ok: true });
});
