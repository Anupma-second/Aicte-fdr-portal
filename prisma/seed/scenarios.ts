import type { DiscrepancyType, FdrStatus, ReleaseStatus, TrustLevel } from "@prisma/client";

export type Scenario = {
  label: string;
  count: number;
  status: FdrStatus;
  trust: TrustLevel;
  /** Inclusive range for days from today to maturity. Negative means already past. */
  maturity: [number, number];
  discrepancy?: DiscrepancyType[];
  release?: ReleaseStatus[];
  missingScan?: boolean;
};

// Counts add up to 114. The six renewal successors in seed/index.ts bring it to 120.
export const SCENARIOS: Scenario[] = [
  { label: "new", count: 18, status: "SUBMITTED", trust: "SELF_DECLARED", maturity: [120, 900] },
  { label: "in-scrutiny", count: 15, status: "UNDER_SCRUTINY", trust: "SELF_DECLARED", maturity: [45, 800] },
  {
    label: "discrepancy",
    count: 12,
    status: "DISCREPANCY_RAISED",
    trust: "SELF_DECLARED",
    maturity: [20, 600],
    // The seed makes the first four duplicate FDR numbers across institutions; the rest cycle through these.
    discrepancy: ["AMOUNT_MISMATCH", "MISSING_DOCUMENT", "MATURITY_BEFORE_ISSUE", "BANK_MISMATCH", "MISSING_FIELD"],
  },
  { label: "verified", count: 6, status: "VERIFIED", trust: "DOCUMENT_VERIFIED", maturity: [200, 900] },
  { label: "active", count: 22, status: "ACTIVE", trust: "BANK_CONFIRMED", maturity: [95, 1000] },
  { label: "expiring", count: 14, status: "EXPIRING", trust: "BANK_CONFIRMED", maturity: [1, 90] },
  { label: "overdue", count: 8, status: "MATURED", trust: "BANK_CONFIRMED", maturity: [-75, -1] },
  { label: "renewed", count: 3, status: "RENEWED", trust: "BANK_CONFIRMED", maturity: [-200, -10] },
  { label: "replaced", count: 3, status: "REPLACED", trust: "BANK_CONFIRMED", maturity: [-200, -10] },
  {
    label: "release",
    count: 5,
    status: "RELEASE_REQUESTED",
    trust: "BANK_CONFIRMED",
    maturity: [-40, 15],
    release: ["REQUESTED", "DOCUMENT_CHECK", "SCRUTINY", "AUTHORITY_APPROVAL", "AUTHORITY_APPROVAL"],
  },
  { label: "released", count: 4, status: "RELEASED", trust: "BANK_CONFIRMED", maturity: [-300, -60], release: ["APPROVED"] },
  { label: "closed", count: 4, status: "CLOSED", trust: "BANK_CONFIRMED", maturity: [-500, -200], release: ["CLOSED"] },
];
