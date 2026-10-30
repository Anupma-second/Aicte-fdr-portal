import { NextResponse, type NextRequest } from "next/server";
import { appendAudit } from "@/lib/audit/chain";
import { SESSION_COOKIE } from "@/lib/auth/jwt";
import { requireRole } from "@/lib/auth/guards";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { createSessionToken, sessionCookieOptions } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { ApiError, handler } from "@/lib/errors";
import { changePasswordSchema } from "@/lib/validation/auth";

const MAX_ATTEMPTS = 10;

export const POST = handler(async (request: NextRequest) => {
  const user = await requireRole();
  await consumeRateLimit("password", user.id, MAX_ATTEMPTS);
  const { currentPassword, newPassword } = changePasswordSchema.parse(await request.json());

  const stored = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { passwordHash: true } });
  if (!(await verifyPassword(currentPassword, stored.passwordHash))) {
    throw new ApiError(400, "WRONG_PASSWORD", "The current password is incorrect");
  }
  if (currentPassword === newPassword) throw new ApiError(400, "SAME_PASSWORD", "Choose a different password");

  const passwordHash = await hashPassword(newPassword);
  const updated = await db.$transaction(async (tx) => {
    // Ends every other session. This browser gets a fresh cookie below.
    const row = await tx.user.update({
      where: { id: user.id },
      data: { passwordHash, tokenVersion: { increment: 1 } },
      select: { id: true, role: true, tokenVersion: true },
    });
    await appendAudit(tx, { actorId: user.id, actorLabel: user.email, action: "PASSWORD_CHANGED", entityType: "User", entityId: user.id });
    return row;
  });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, await createSessionToken(updated), sessionCookieOptions());
  return response;
});
