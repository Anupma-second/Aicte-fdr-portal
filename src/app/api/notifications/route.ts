import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { handler } from "@/lib/errors";

/** Marks all of the signed-in user's notifications as read. */
export const POST = handler(async () => {
  const user = await requireRole();
  await db.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
  return NextResponse.json({ ok: true });
});
