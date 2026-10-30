// Edge-safe: imported by middleware, so no Prisma client or Node APIs here.
import type { Role } from "@prisma/client";
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "aicte_session";
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

export type SessionClaims = {
  sub: string;
  role: Role;
  /** Compared with User.tokenVersion so sessions can be revoked. */
  tv: number;
};

function secretKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error("JWT_SECRET is missing or too short");
  return new TextEncoder().encode(secret);
}

export async function signSession(claims: SessionClaims): Promise<string> {
  return new SignJWT({ role: claims.role, tv: claims.tv })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());
}

/** Returns null for anything invalid or expired, rather than throwing. */
export async function verifySession(token: string | undefined): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string" || typeof payload.role !== "string" || typeof payload.tv !== "number") {
      return null;
    }
    return { sub: payload.sub, role: payload.role as Role, tv: payload.tv };
  } catch {
    return null;
  }
}
