import type { Role } from "@prisma/client";

export type NavIcon =
  | "dashboard"
  | "fdrs"
  | "calendar"
  | "reports"
  | "audit"
  | "notifications"
  | "users";

export type NavItem = { href: string; labelKey: string; icon: NavIcon };

const HOME: Record<Role, string> = {
  INSTITUTION: "/institution",
  SCRUTINY_OFFICER: "/officer",
  COMPETENT_AUTHORITY: "/authority",
  ADMIN: "/admin",
};

const FDRS: NavItem = { href: "/fdrs", labelKey: "fdrs", icon: "fdrs" };
const CALENDAR: NavItem = { href: "/calendar", labelKey: "calendar", icon: "calendar" };
const REPORTS: NavItem = { href: "/reports", labelKey: "reports", icon: "reports" };
const AUDIT: NavItem = { href: "/audit", labelKey: "audit", icon: "audit" };
const NOTIFICATIONS: NavItem = { href: "/notifications", labelKey: "notifications", icon: "notifications" };

const EXTRA_ITEMS: Record<Role, NavItem[]> = {
  INSTITUTION: [FDRS, CALENDAR, NOTIFICATIONS],
  SCRUTINY_OFFICER: [FDRS, CALENDAR, REPORTS, NOTIFICATIONS],
  COMPETENT_AUTHORITY: [FDRS, CALENDAR, REPORTS, AUDIT, NOTIFICATIONS],
  ADMIN: [{ href: "/admin/users", labelKey: "users", icon: "users" }, FDRS, CALENDAR, REPORTS, AUDIT, NOTIFICATIONS],
};

export function navForRole(role: Role): NavItem[] {
  return [{ href: HOME[role], labelKey: "dashboard", icon: "dashboard" }, ...EXTRA_ITEMS[role]];
}
