import type { Role } from "@prisma/client";
import { redirect } from "next/navigation";
import { ApiError } from "@/lib/errors";
import { getSessionUser, type SessionUser } from "./session";

/** For route handlers: throws 401 or 403. */
export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new ApiError(401, "UNAUTHENTICATED", "Please sign in");
  if (roles.length > 0 && !roles.includes(user.role)) {
    throw new ApiError(403, "FORBIDDEN", "You don't have access to this");
  }
  return user;
}

/** For server components. The clear route drops a stale cookie so middleware can't loop back. */
export async function requirePageRole(...roles: Role[]): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/api/auth/clear");
  if (roles.length > 0 && !roles.includes(user.role)) redirect("/forbidden");
  return user;
}
