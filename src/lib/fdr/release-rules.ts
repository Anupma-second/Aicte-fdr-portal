import type { FdrStatus, ReleaseStatus, Role } from "@prisma/client";

export type ReleaseAction = "ADVANCE" | "APPROVE" | "REJECT" | "CLOSE";
export type ReleaseBlocker = "NO_APPLICATION" | "UNRESOLVED";

export const RELEASE_STEPS: ReleaseStatus[] = ["REQUESTED", "DOCUMENT_CHECK", "SCRUTINY", "AUTHORITY_APPROVAL", "APPROVED", "CLOSED"];
export const CAN_REQUEST_RELEASE: FdrStatus[] = ["ACTIVE", "EXPIRING", "MATURED"];

const NEXT_STEP: Partial<Record<ReleaseStatus, ReleaseStatus>> = {
  REQUESTED: "DOCUMENT_CHECK",
  DOCUMENT_CHECK: "SCRUTINY",
  SCRUTINY: "AUTHORITY_APPROVAL",
};

export function nextReleaseStep(status: ReleaseStatus): ReleaseStatus | null {
  return NEXT_STEP[status] ?? null;
}

/** Who may do what at each step. Enforced on the server, and also used to choose the buttons. */
export function releaseActions(status: ReleaseStatus, role: Role): ReleaseAction[] {
  if (role === "SCRUTINY_OFFICER") {
    if (NEXT_STEP[status]) return ["ADVANCE"];
    return status === "APPROVED" ? ["CLOSE"] : [];
  }
  if (role === "COMPETENT_AUTHORITY") {
    if (status === "AUTHORITY_APPROVAL") return ["APPROVE", "REJECT"];
    return status === "APPROVED" ? ["CLOSE"] : [];
  }
  return [];
}

/** What must be true before a request can leave its current step. */
export function releaseBlockers(status: ReleaseStatus, state: { hasApplication: boolean; unresolvedDiscrepancies: number }): ReleaseBlocker[] {
  if (status === "DOCUMENT_CHECK" && !state.hasApplication) return ["NO_APPLICATION"];
  if (status === "SCRUTINY" && state.unresolvedDiscrepancies > 0) return ["UNRESOLVED"];
  return [];
}

/** A rejected release returns the FDR to the status its dates call for. */
export function statusAfterRejection(daysToMaturity: number): FdrStatus {
  if (daysToMaturity < 0) return "MATURED";
  return daysToMaturity <= 90 ? "EXPIRING" : "ACTIVE";
}
