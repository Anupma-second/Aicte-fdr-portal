import { describe, expect, it } from "vitest";
import { dueEscalations, dueReminder, type RuleLike } from "@/lib/alerts/rules";
import { nextReleaseStep, releaseActions, releaseBlockers, statusAfterRejection } from "@/lib/fdr/release-rules";
import { canTransition } from "@/lib/fdr/status-machine";
import { decodeText, encodeText, renderText } from "@/lib/notifications/format";

const rule = (kind: RuleLike["kind"], days: number, targetLevel: RuleLike["targetLevel"] = "INSTITUTION"): RuleLike => ({ id: `${kind}${days}`, kind, days, targetLevel });
const RULES = [
  rule("REMINDER", 90),
  rule("REMINDER", 60),
  rule("REMINDER", 30),
  rule("REMINDER", 7),
  rule("ESCALATION", 1),
  rule("ESCALATION", 7, "SCRUTINY_OFFICER"),
  rule("ESCALATION", 15, "COMPETENT_AUTHORITY"),
];

describe("reminder tiers", () => {
  it.each([
    [120, null],
    [91, null],
    [90, 90],
    [61, 90],
    [60, 60],
    [25, 30],
    [7, 7],
    [0, 7],
  ])("at %i days to go, the tier is %s", (days, expected) => {
    expect(dueReminder(days, RULES)?.days ?? null).toBe(expected);
  });

  it("stops once overdue", () => {
    expect(dueReminder(-1, RULES)).toBeNull();
  });
});

describe("escalation ladder", () => {
  it("climbs one rung at a time, lowest first", () => {
    expect(dueEscalations(0, RULES)).toEqual([]);
    expect(dueEscalations(-1, RULES).map((item) => item.targetLevel)).toEqual(["INSTITUTION"]);
    expect(dueEscalations(-7, RULES).map((item) => item.targetLevel)).toEqual(["INSTITUTION", "SCRUTINY_OFFICER"]);
    expect(dueEscalations(-30, RULES).map((item) => item.targetLevel)).toEqual(["INSTITUTION", "SCRUTINY_OFFICER", "COMPETENT_AUTHORITY"]);
  });

  it("does nothing with no rules", () => {
    expect(dueEscalations(-30, [])).toEqual([]);
    expect(dueReminder(5, [])).toBeNull();
  });
});

describe("release rules", () => {
  it("runs in the documented order", () => {
    expect(nextReleaseStep("REQUESTED")).toBe("DOCUMENT_CHECK");
    expect(nextReleaseStep("DOCUMENT_CHECK")).toBe("SCRUTINY");
    expect(nextReleaseStep("SCRUTINY")).toBe("AUTHORITY_APPROVAL");
    expect(nextReleaseStep("AUTHORITY_APPROVAL")).toBeNull();
  });

  it("only the authority can decide", () => {
    expect(releaseActions("AUTHORITY_APPROVAL", "COMPETENT_AUTHORITY")).toEqual(["APPROVE", "REJECT"]);
    expect(releaseActions("AUTHORITY_APPROVAL", "SCRUTINY_OFFICER")).toEqual([]);
    expect(releaseActions("AUTHORITY_APPROVAL", "ADMIN")).toEqual([]);
    expect(releaseActions("AUTHORITY_APPROVAL", "INSTITUTION")).toEqual([]);
  });

  it("the authority can't skip the officer's steps", () => {
    expect(releaseActions("REQUESTED", "COMPETENT_AUTHORITY")).toEqual([]);
    expect(releaseActions("SCRUTINY", "COMPETENT_AUTHORITY")).toEqual([]);
  });

  it("finished requests allow nothing", () => {
    for (const role of ["SCRUTINY_OFFICER", "COMPETENT_AUTHORITY"] as const) {
      expect(releaseActions("CLOSED", role)).toEqual([]);
      expect(releaseActions("REJECTED", role)).toEqual([]);
    }
  });

  it("blocks on a missing application and on open discrepancies", () => {
    expect(releaseBlockers("DOCUMENT_CHECK", { hasApplication: false, unresolvedDiscrepancies: 0 })).toEqual(["NO_APPLICATION"]);
    expect(releaseBlockers("DOCUMENT_CHECK", { hasApplication: true, unresolvedDiscrepancies: 2 })).toEqual([]);
    expect(releaseBlockers("SCRUTINY", { hasApplication: true, unresolvedDiscrepancies: 1 })).toEqual(["UNRESOLVED"]);
  });

  it("a rejection returns the FDR to the status its dates call for, which the status machine allows", () => {
    for (const [days, status] of [[-5, "MATURED"], [30, "EXPIRING"], [400, "ACTIVE"]] as const) {
      expect(statusAfterRejection(days)).toBe(status);
      expect(canTransition("RELEASE_REQUESTED", status, "COMPETENT_AUTHORITY")).toBe(true);
    }
  });
});

describe("notification text", () => {
  const t = (key: string, values?: Record<string, string | number>) => `${key}:${values?.days}`;

  it("round-trips a key and its values", () => {
    expect(decodeText(encodeText("REMINDER", { days: 30 }))).toEqual({ key: "REMINDER", params: { days: 30 } });
    expect(renderText(encodeText("REMINDER", { days: 30 }), t)).toBe("REMINDER:30");
  });

  it("shows older plain text as it is", () => {
    expect(renderText("FDR matures in 3 days", t)).toBe("FDR matures in 3 days");
    expect(decodeText("i18n:broken|{not json")).toBeNull();
  });
});
