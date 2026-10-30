import { NextResponse, type NextRequest } from "next/server";
import { appendAudit } from "@/lib/audit/chain";
import { SESSION_COOKIE } from "@/lib/auth/jwt";
import { verifyPassword } from "@/lib/auth/password";
import { assertNotLocked, clearFailures, recordFailure } from "@/lib/auth/rate-limit";
import { createSessionToken, sessionCookieOptions } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { ApiError, handler } from "@/lib/errors";
import { ROLE_HOME } from "@/lib/rbac";
import { loginSchema } from "@/lib/validation/auth";

const ACCOUNT_BLOCKED_CODES = {
  PENDING_APPROVAL: "ACCOUNT_PENDING",
  SUSPENDED: "ACCOUNT_SUSPENDED",
  REJECTED: "ACCOUNT_REJECTED",
} as const;

export const POST = handler(async (request: NextRequest) => {
  const { email, password } = loginSchema.parse(await request.json());
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  await assertNotLocked(ip, email);

  const user = await db.user.findUnique({ where: { email } });
  const passwordOk = await verifyPassword(password, user?.passwordHash);

  if (!user || !passwordOk) {
    await recordFailure(ip, email);
    await db.$transaction((tx) =>
      appendAudit(tx, {
        actorId: null,
        actorLabel: email,
        action: "AUTH_LOGIN_FAILED",
        entityType: "User",
        entityId: user?.id ?? null,
        payload: { ip },
      }),
    );
    throw new ApiError(401, "INVALID_CREDENTIALS", "Incorrect email or password");
  }

  // Only reveal account state once the password has been proven correct.
  if (user.status !== "ACTIVE") {
    throw new ApiError(403, ACCOUNT_BLOCKED_CODES[user.status], "This account can't sign in");
  }

  await clearFailures(ip, email);
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await appendAudit(tx, {
      actorId: user.id,
      actorLabel: user.email,
      action: "AUTH_LOGIN",
      entityType: "User",
      entityId: user.id,
      payload: { ip },
    });
  });

  const response = NextResponse.json({ redirectTo: ROLE_HOME[user.role], role: user.role });
  response.cookies.set(SESSION_COOKIE, await createSessionToken(user), sessionCookieOptions());
  return response;
});
