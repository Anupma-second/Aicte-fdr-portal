import { describe, expect, it } from "vitest";
import { MockBankVerificationService } from "@/lib/bank";
import { approvalBlockers, availableActions, type ScrutinyState } from "@/lib/fdr/scrutiny-rules";
import { canTransition } from "@/lib/fdr/status-machine";

const ready: ScrutinyState = {
  status: "UNDER_SCRUTINY",
  trustLevel: "DOCUMENT_VERIFIED",
  hasCurrentScan: true,
  openDiscrepancies: 0,
  unresolvedDiscrepancies: 0,
  assignedToSomeoneElse: false,
};

describe("scrutiny rules", () => {
  it("allows approval only when everything is in order", () => {
    expect(availableActions(ready)).toContain("APPROVE");
    expect(availableActions({ ...ready, trustLevel: "SELF_DECLARED" })).not.toContain("APPROVE");
    expect(availableActions({ ...ready, hasCurrentScan: false })).not.toContain("APPROVE");
    expect(availableActions({ ...ready, unresolvedDiscrepancies: 1 })).not.toContain("APPROVE");
  });

  it("explains what blocks approval", () => {
    expect(approvalBlockers({ ...ready, trustLevel: "SELF_DECLARED", hasCurrentScan: false, unresolvedDiscrepancies: 2 })).toEqual(["NO_SCAN", "NOT_VERIFIED", "UNRESOLVED"]);
    expect(approvalBlockers(ready)).toEqual([]);
  });

  it("can't start a case twice or approve one not started", () => {
    expect(availableActions(ready)).not.toContain("START");
    expect(availableActions({ ...ready, status: "SUBMITTED" })).toContain("START");
    expect(availableActions({ ...ready, status: "SUBMITTED" })).not.toContain("APPROVE");
  });

  it("gives an officer nothing on another officer's case", () => {
    expect(availableActions({ ...ready, assignedToSomeoneElse: true })).toEqual([]);
  });

  it("offers renewal only on live FDRs", () => {
    expect(availableActions({ ...ready, status: "ACTIVE" })).toContain("LINK_SUCCESSOR");
    expect(availableActions({ ...ready, status: "MATURED" })).toContain("LINK_SUCCESSOR");
    expect(availableActions({ ...ready, status: "SUBMITTED" })).not.toContain("LINK_SUCCESSOR");
    expect(availableActions({ ...ready, status: "RELEASED" })).not.toContain("LINK_SUCCESSOR");
  });

  it("leaves nothing to do on a closed FDR", () => {
    expect(availableActions({ ...ready, status: "CLOSED" })).toEqual([]);
  });

  it("every status change an action needs is allowed by the status machine", () => {
    expect(canTransition("SUBMITTED", "UNDER_SCRUTINY", "SCRUTINY_OFFICER")).toBe(true);
    expect(canTransition("UNDER_SCRUTINY", "DISCREPANCY_RAISED", "SCRUTINY_OFFICER")).toBe(true);
    expect(canTransition("UNDER_SCRUTINY", "VERIFIED", "SCRUTINY_OFFICER")).toBe(true);
    expect(canTransition("VERIFIED", "ACTIVE", "SCRUTINY_OFFICER")).toBe(true);
    expect(canTransition("EXPIRING", "RENEWED", "SCRUTINY_OFFICER")).toBe(true);
    expect(canTransition("MATURED", "REPLACED", "SCRUTINY_OFFICER")).toBe(true);
    expect(canTransition("RENEWED", "CLOSED", "SCRUTINY_OFFICER")).toBe(true);
  });
});

describe("mock bank adapter", () => {
  const service = new MockBankVerificationService();
  const request = (fdrNumber: string) => ({ fdrNumber, bankName: "Axis Bank", amount: "500000", maturityDate: new Date("2030-01-01") });

  it("is forced to not-found and mismatch by demo numbers", async () => {
    expect((await service.verify(request("DEMONF123"))).result).toBe("NOT_FOUND");
    const mismatch = await service.verify(request("DEMOMM123"));
    expect(mismatch.result).toBe("MISMATCH");
    expect(mismatch.confirmedAmount).not.toBe("500000");
  });

  it("gives the same answer every time", async () => {
    expect(await service.verify(request("ABC12345"))).toEqual(await service.verify(request("ABC12345")));
  });

  it("confirms most numbers, with the declared values", async () => {
    const results = await Promise.all(Array.from({ length: 200 }, (_, index) => service.verify(request(`X${index}`))));
    const confirmed = results.filter((item) => item.result === "CONFIRMED");
    expect(confirmed.length).toBeGreaterThan(120);
    expect(confirmed[0].confirmedAmount).toBe("500000");
  });
});
