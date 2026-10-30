import { createHash } from "node:crypto";
import type { BankVerificationResult } from "@prisma/client";
import { addDays } from "@/lib/fdr/dates";

export type BankVerificationRequest = {
  fdrNumber: string;
  bankName: string;
  amount: string;
  maturityDate: Date;
};

export type BankVerificationResponse = {
  result: BankVerificationResult;
  /** What the bank's own record says. Null when it has no record. */
  confirmedAmount: string | null;
  confirmedMaturityDate: Date | null;
};

/** The only thing a real bank integration needs to implement. */
export interface BankVerificationService {
  readonly adapterName: string;
  verify(request: BankVerificationRequest): Promise<BankVerificationResponse>;
}

/**
 * SIMULATED. No bank is contacted. The answer is derived from the FDR number, so the
 * same FDR always gets the same answer and a demo can be repeated:
 * - a number containing "NF" is not found, and one containing "MM" is a mismatch
 * - any other number: about 10% not found, 10% mismatch, the rest confirmed
 */
export class MockBankVerificationService implements BankVerificationService {
  readonly adapterName = "mock";

  async verify(request: BankVerificationRequest): Promise<BankVerificationResponse> {
    const number = request.fdrNumber.toUpperCase();
    const bucket = createHash("sha256").update(number).digest()[0] % 10;

    if (number.includes("NF") || bucket === 0) {
      return { result: "NOT_FOUND", confirmedAmount: null, confirmedMaturityDate: null };
    }
    if (number.includes("MM") || bucket === 1) {
      return {
        result: "MISMATCH",
        confirmedAmount: String(Math.max(Number(request.amount) - 25000, 1000)),
        confirmedMaturityDate: addDays(request.maturityDate, -30),
      };
    }
    return { result: "CONFIRMED", confirmedAmount: request.amount, confirmedMaturityDate: request.maturityDate };
  }
}

export function getBankVerificationService(): BankVerificationService {
  return new MockBankVerificationService();
}
