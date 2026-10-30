import type { FdrStatus, RiskLevel } from "@prisma/client";

export type RiskInput = {
  status: FdrStatus;
  daysToMaturity: number;
  missingDocuments: number;
  pastDelays: number;
  openDiscrepancies: number;
  resolvedDiscrepancies: number;
};

export type RiskReasonCode =
  | "OVERDUE"
  | "MATURES_WITHIN_7"
  | "MATURES_WITHIN_30"
  | "MATURES_WITHIN_60"
  | "MATURES_WITHIN_90"
  | "MISSING_DOCUMENTS"
  | "PAST_DELAYS"
  | "OPEN_DISCREPANCIES"
  | "DISCREPANCY_HISTORY";

export type RiskReason = { code: RiskReasonCode; points: number; value: number };

export type RiskResult = { score: number; level: RiskLevel; reasons: RiskReason[] };

export const RED_THRESHOLD = 60;
export const AMBER_THRESHOLD = 30;

/** Maturity no longer matters once the deposit has been renewed, released or closed. */
const NO_RISK_STATUSES: FdrStatus[] = ["RENEWED", "REPLACED", "RELEASED", "CLOSED"];

function maturityReason(days: number): RiskReason | null {
  if (days < 0) return { code: "OVERDUE", points: 70, value: -days };
  if (days <= 7) return { code: "MATURES_WITHIN_7", points: 60, value: days };
  if (days <= 30) return { code: "MATURES_WITHIN_30", points: 35, value: days };
  if (days <= 60) return { code: "MATURES_WITHIN_60", points: 15, value: days };
  if (days <= 90) return { code: "MATURES_WITHIN_90", points: 5, value: days };
  return null;
}

function cappedReason(code: RiskReasonCode, count: number, perItem: number, cap: number): RiskReason | null {
  return count > 0 ? { code, points: Math.min(count * perItem, cap), value: count } : null;
}

/** Rule-based and explainable: the reasons are exactly what the score adds up from. */
export function computeRisk(input: RiskInput): RiskResult {
  if (NO_RISK_STATUSES.includes(input.status)) return { score: 0, level: "GREEN", reasons: [] };

  const reasons = [
    maturityReason(input.daysToMaturity),
    cappedReason("MISSING_DOCUMENTS", input.missingDocuments, 15, 30),
    cappedReason("OPEN_DISCREPANCIES", input.openDiscrepancies, 15, 30),
    cappedReason("PAST_DELAYS", input.pastDelays, 10, 20),
    cappedReason("DISCREPANCY_HISTORY", input.resolvedDiscrepancies, 3, 10),
  ].filter((reason): reason is RiskReason => reason !== null);

  const score = Math.min(
    reasons.reduce((total, reason) => total + reason.points, 0),
    100,
  );
  const level: RiskLevel = score >= RED_THRESHOLD ? "RED" : score >= AMBER_THRESHOLD ? "AMBER" : "GREEN";
  return { score, level, reasons };
}
