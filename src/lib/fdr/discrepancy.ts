import type { DiscrepancySeverity, DiscrepancyType } from "@prisma/client";
import { isoDate, sameAmount, sameBank } from "./compare";

export type DetectionInput = {
  amount: string;
  bankName: string;
  issueDate: Date;
  maturityDate: Date;
  ifscCode: string | null;
  hasCurrentScan: boolean;
  ocr: { amount: string | null; bankName: string | null } | null;
  duplicateElsewhere: boolean;
};

export type DetectedDiscrepancy = {
  type: DiscrepancyType;
  severity: DiscrepancySeverity;
  field?: string;
  declaredValue?: string;
  extractedValue?: string;
  message: string;
};

/** Pure rules, so each one can be tested. Run again whenever an FDR or its documents change. */
export function detectDiscrepancies(input: DetectionInput): DetectedDiscrepancy[] {
  const found: DetectedDiscrepancy[] = [];

  if (!input.hasCurrentScan) {
    found.push({ type: "MISSING_DOCUMENT", severity: "MEDIUM", message: "The FDR scan has not been uploaded." });
  }
  if (input.maturityDate <= input.issueDate) {
    found.push({
      type: "MATURITY_BEFORE_ISSUE",
      severity: "HIGH",
      field: "maturityDate",
      declaredValue: `${isoDate(input.issueDate)} to ${isoDate(input.maturityDate)}`,
      message: "The maturity date is not after the issue date.",
    });
  }
  if (input.ocr?.amount && !sameAmount(input.amount, input.ocr.amount)) {
    found.push({
      type: "AMOUNT_MISMATCH",
      severity: "HIGH",
      field: "amount",
      declaredValue: input.amount,
      extractedValue: input.ocr.amount,
      message: "The declared amount does not match the amount read from the document.",
    });
  }
  if (input.ocr?.bankName && !sameBank(input.bankName, input.ocr.bankName)) {
    found.push({
      type: "BANK_MISMATCH",
      severity: "MEDIUM",
      field: "bankName",
      declaredValue: input.bankName,
      extractedValue: input.ocr.bankName,
      message: "The declared bank does not match the bank named on the document.",
    });
  }
  if (input.duplicateElsewhere) {
    found.push({
      type: "DUPLICATE_FDR_NUMBER",
      severity: "HIGH",
      field: "fdrNumber",
      message: "This FDR number is already on record for another institution.",
    });
  }
  if (!input.ifscCode) {
    found.push({ type: "MISSING_FIELD", severity: "LOW", field: "ifscCode", message: "The branch IFSC code is missing." });
  }
  return found;
}
