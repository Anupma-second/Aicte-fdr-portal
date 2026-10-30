// Edge-safe: imported by middleware, so no Prisma client or Node APIs here.
import type { Role } from "@prisma/client";

export const ROLE_HOME: Record<Role, string> = {
  INSTITUTION: "/institution",
  SCRUTINY_OFFICER: "/officer",
  COMPETENT_AUTHORITY: "/authority",
  ADMIN: "/admin",
};

const ALL_ROLES: Role[] = ["INSTITUTION", "SCRUTINY_OFFICER", "COMPETENT_AUTHORITY", "ADMIN"];
const STAFF_ROLES: Role[] = ["SCRUTINY_OFFICER", "COMPETENT_AUTHORITY", "ADMIN"];

/** Longest matching prefix wins. Anything not listed and not public needs only a valid session. */
const ROUTE_ROLES: { prefix: string; roles: Role[] }[] = [
  { prefix: "/institution", roles: ["INSTITUTION"] },
  { prefix: "/officer", roles: ["SCRUTINY_OFFICER"] },
  { prefix: "/authority", roles: ["COMPETENT_AUTHORITY"] },
  { prefix: "/admin", roles: ["ADMIN"] },
  { prefix: "/fdrs/new", roles: ["INSTITUTION"] },
  { prefix: "/fdrs", roles: ALL_ROLES },
  { prefix: "/calendar", roles: ALL_ROLES },
  { prefix: "/notifications", roles: ALL_ROLES },
  { prefix: "/reports", roles: STAFF_ROLES },
  { prefix: "/audit", roles: ["COMPETENT_AUTHORITY", "ADMIN"] },
  { prefix: "/api/admin", roles: ["ADMIN"] },
  { prefix: "/api/reports", roles: STAFF_ROLES },
  { prefix: "/api/audit", roles: ["COMPETENT_AUTHORITY", "ADMIN"] },
];

const PUBLIC_PATHS = ["/", "/login", "/register", "/forbidden"];
const PUBLIC_API_PATHS = ["/api/auth/login", "/api/auth/register", "/api/auth/clear", "/api/locale", "/api/track"];

function matchesPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.includes(pathname) || PUBLIC_API_PATHS.some((path) => matchesPrefix(pathname, path));
}

export function rolesForPath(pathname: string): Role[] | null {
  const match = ROUTE_ROLES.filter((route) => matchesPrefix(pathname, route.prefix)).sort(
    (a, b) => b.prefix.length - a.prefix.length,
  )[0];
  return match?.roles ?? null;
}

export function canAccessPath(role: Role, pathname: string): boolean {
  const roles = rolesForPath(pathname);
  return roles === null || roles.includes(role);
}
