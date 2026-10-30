import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/errors";
import { allowedTransitions, assertTransition, canTransition } from "@/lib/fdr/status-machine";

describe("FDR status machine", () => {
  it("allows the documented happy path", () => {
    expect(canTransition("SUBMITTED", "UNDER_SCRUTINY", "SCRUTINY_OFFICER")).toBe(true);
    expect(canTransition("UNDER_SCRUTINY", "VERIFIED", "SCRUTINY_OFFICER")).toBe(true);
    expect(canTransition("VERIFIED", "ACTIVE", "SYSTEM")).toBe(true);
    expect(canTransition("ACTIVE", "EXPIRING", "SYSTEM")).toBe(true);
    expect(canTransition("EXPIRING", "MATURED", "SYSTEM")).toBe(true);
    expect(canTransition("MATURED", "RELEASE_REQUESTED", "INSTITUTION")).toBe(true);
    expect(canTransition("RELEASE_REQUESTED", "RELEASED", "COMPETENT_AUTHORITY")).toBe(true);
    expect(canTransition("RELEASED", "CLOSED", "SCRUTINY_OFFICER")).toBe(true);
  });

  it("refuses to skip scrutiny", () => {
    expect(canTransition("SUBMITTED", "VERIFIED", "SCRUTINY_OFFICER")).toBe(false);
    expect(canTransition("SUBMITTED", "ACTIVE", "ADMIN")).toBe(false);
  });

  it("only lets the competent authority release a deposit", () => {
    for (const actor of ["INSTITUTION", "SCRUTINY_OFFICER", "ADMIN", "SYSTEM"] as const) {
      expect(canTransition("RELEASE_REQUESTED", "RELEASED", actor)).toBe(false);
    }
  });

  it("does not let an institution verify its own FDR", () => {
    expect(canTransition("UNDER_SCRUTINY", "VERIFIED", "INSTITUTION")).toBe(false);
  });

  it("treats CLOSED as final", () => {
    expect(allowedTransitions("CLOSED", "COMPETENT_AUTHORITY")).toEqual([]);
    expect(allowedTransitions("CLOSED", "SYSTEM")).toEqual([]);
  });

  it("returns 403 for the wrong actor and 409 for an impossible move", () => {
    const statusOf = (fn: () => void) => {
      try {
        fn();
      } catch (error) {
        return (error as ApiError).status;
      }
      return null;
    };
    expect(statusOf(() => assertTransition("UNDER_SCRUTINY", "VERIFIED", "INSTITUTION"))).toBe(403);
    expect(statusOf(() => assertTransition("CLOSED", "ACTIVE", "ADMIN"))).toBe(409);
    expect(statusOf(() => assertTransition("UNDER_SCRUTINY", "VERIFIED", "SCRUTINY_OFFICER"))).toBeNull();
  });
});
