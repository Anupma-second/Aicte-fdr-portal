import { z } from "zod";

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), "Invalid date");

export const fdrInputSchema = z.object({
  fdrNumber: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9][A-Z0-9/-]{3,39}$/),
  bankName: z.string().trim().min(2).max(120),
  branchName: z.string().trim().min(2).max(120),
  ifscCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  amount: z
    .string()
    .trim()
    .regex(/^\d{1,12}(\.\d{1,2})?$/)
    .refine((value) => Number(value) > 0, "Amount must be more than zero"),
  // A maturity date before the issue date is stored and flagged, not rejected, so officers see it.
  issueDate: dateString,
  maturityDate: dateString,
});

export type FdrInput = z.infer<typeof fdrInputSchema>;

export const discrepancyResponseSchema = z.object({
  response: z.string().trim().min(5).max(2000),
});

export const documentTypeSchema = z.enum([
  "FDR_SCAN",
  "COVERING_LETTER",
  "BANK_LETTER",
  "RENEWAL_PROOF",
  "RELEASE_APPLICATION",
  "OTHER",
]);

export function toUtcDate(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}
