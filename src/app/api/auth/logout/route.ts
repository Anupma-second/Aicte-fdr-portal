import { NextResponse } from "next/server";
import { appendAudit } from "@/lib/audit/chain";
import { SESSION_COOKIE } from "@/lib/auth/jwt";
import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { handler } from "@/lib/errors";

export const POST = handler(async () => {
  const user = await requireRole();
  await db.$transaction((tx) =>
    appendAudit(tx, {
      actorId: user.id,
      actorLabel: user.email,
      action: "AUTH_LOGOUT",
      entityType: "User",
      entityId: user.id,
    }),
  );
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(SESSION_COOKIE);
  return response;
});
