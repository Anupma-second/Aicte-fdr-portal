import type { FdrStatus, TrustLevel } from "@prisma/client";

export type ScrutinyAction =
  | "START"
  | "OBSERVE"
  | "RAISE"
  | "SEND_BACK"
  | "CLOSE_DISCREPANCY"
  | "VERIFY_DOCUMENTS"
  | "BANK_VERIFY"
  | "APPROVE"
  | "ACTIVATE"
  | "LINK_SUCCESSOR"
  | "CLOSE";

export type ScrutinyState = {
  status: FdrStatus;
  trustLevel: TrustLevel;
  hasCurrentScan: boolean;
  openDiscrepancies: number;
  unresolvedDiscrepancies: number;
  assignedToSomeoneElse: boolean;
};

export type ApprovalBlocker = "NO_SCAN" | "NOT_VERIFIED" | "UNRESOLVED";

const REVIEWING: FdrStatus[] = ["UNDER_SCRUTINY", "DISCREPANCY_RAISED"];
const LIVE: FdrStatus[] = ["VERIFIED", "ACTIVE", "EXPIRING", "MATURED"];
const CAN_BE_SUCCEEDED: FdrStatus[] = ["ACTIVE", "EXPIRING", "MATURED"];

export function approvalBlockers(state: ScrutinyState): ApprovalBlocker[] {
  const blockers: ApprovalBlocker[] = [];
  if (!state.hasCurrentScan) blockers.push("NO_SCAN");
  if (state.trustLevel === "SELF_DECLARED") blockers.push("NOT_VERIFIED");
  if (state.unresolvedDiscrepancies > 0) blockers.push("UNRESOLVED");
  return blockers;
}

/**
 * The single source of truth for what an officer may do next. The screen uses it to
 * choose buttons, and the server checks it again before doing anything.
 */
export function availableActions(state: ScrutinyState): ScrutinyAction[] {
  if (state.assignedToSomeoneElse) return [];
  const { status } = state;
  const actions: ScrutinyAction[] = [];

  if (status !== "CLOSED") actions.push("OBSERVE");
  if (status === "SUBMITTED") actions.push("START");
  if (REVIEWING.includes(status) || LIVE.includes(status)) actions.push("RAISE", "CLOSE_DISCREPANCY", "BANK_VERIFY");
  if (status === "UNDER_SCRUTINY") {
    if (state.openDiscrepancies > 0) actions.push("SEND_BACK");
    if (state.trustLevel === "SELF_DECLARED" && state.hasCurrentScan) actions.push("VERIFY_DOCUMENTS");
    if (approvalBlockers(state).length === 0) actions.push("APPROVE");
  }
  if (status === "VERIFIED") actions.push("ACTIVATE");
  if (CAN_BE_SUCCEEDED.includes(status)) actions.push("LINK_SUCCESSOR");
  if (status === "RENEWED" || status === "REPLACED") actions.push("CLOSE");
  return actions;
}
