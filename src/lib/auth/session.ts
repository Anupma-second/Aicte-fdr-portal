import type { Institution, User } from "@prisma/client";
import { cookies } from "next/headers";
import { cache } from "react";
import { db } from "@/lib/db";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSession, verifySession } from "./jwt";

export type SessionUser = Pick<User, "id" | "email" | "name" | "role" | "status" | "institutionId"> & {
  institution: Pick<Institution, "id" | "name" | "aicteCode"> | null;
};

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}

export async function createSessionToken(user: Pick<User, "id" | "role" | "tokenVersion">) {
  return signSession({ sub: user.id, role: user.role, tv: user.tokenVersion });
}

/**
 * The real session check: a valid signature isn't enough, the account must still
 * be active and the token must not have been revoked. Cached per request.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const claims = await verifySession(store.get(SESSION_COOKIE)?.value);
  if (!claims) return null;

  const user = await db.user.findUnique({
    where: { id: claims.sub },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      institutionId: true,
      tokenVersion: true,
      institution: { select: { id: true, name: true, aicteCode: true } },
    },
  });
  if (!user || user.status !== "ACTIVE" || user.tokenVersion !== claims.tv) return null;

  const { tokenVersion: _tokenVersion, ...sessionUser } = user;
  return sessionUser;
});
