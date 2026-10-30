import { describe, expect, it } from "vitest";
import { canAccessPath, isPublicPath, rolesForPath } from "@/lib/rbac";

describe("route access", () => {
  it("keeps each dashboard to its own role", () => {
    expect(canAccessPath("ADMIN", "/admin")).toBe(true);
    expect(canAccessPath("SCRUTINY_OFFICER", "/admin")).toBe(false);
    expect(canAccessPath("INSTITUTION", "/officer")).toBe(false);
    expect(canAccessPath("COMPETENT_AUTHORITY", "/institution/anything")).toBe(false);
  });

  it("does not confuse paths that only share a prefix", () => {
    expect(rolesForPath("/administrator")).toBeNull();
    expect(rolesForPath("/admin/users")).toEqual(["ADMIN"]);
  });

  it("limits admin APIs to admins", () => {
    expect(canAccessPath("COMPETENT_AUTHORITY", "/api/admin/users")).toBe(false);
    expect(canAccessPath("ADMIN", "/api/admin/users")).toBe(true);
  });

  it("keeps reports and audit away from institutions", () => {
    expect(canAccessPath("INSTITUTION", "/reports")).toBe(false);
    expect(canAccessPath("INSTITUTION", "/audit")).toBe(false);
    expect(canAccessPath("SCRUTINY_OFFICER", "/audit")).toBe(false);
  });

  it("marks only intended paths as public", () => {
    expect(isPublicPath("/")).toBe(true);
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/api/auth/login")).toBe(true);
    expect(isPublicPath("/api/auth/me")).toBe(false);
    expect(isPublicPath("/fdrs")).toBe(false);
  });
});
