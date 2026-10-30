import { z } from "zod";

const note = z.string().trim().min(5).max(2000);

export const scrutinyActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("START") }),
  z.object({ action: z.literal("OBSERVE"), note }),
  z.object({
    action: z.literal("RAISE"),
    severity: z.enum(["LOW", "MEDIUM", "HIGH"]),
    message: note,
  }),
  z.object({ action: z.literal("SEND_BACK") }),
  z.object({
    action: z.literal("CLOSE_DISCREPANCY"),
    discrepancyId: z.string().min(1).max(40),
    note,
  }),
  z.object({ action: z.literal("VERIFY_DOCUMENTS") }),
  z.object({ action: z.literal("BANK_VERIFY") }),
  z.object({ action: z.literal("APPROVE") }),
  z.object({ action: z.literal("ACTIVATE") }),
  z.object({
    action: z.literal("LINK_SUCCESSOR"),
    type: z.enum(["RENEWAL", "REPLACEMENT"]),
    successorReference: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^FDR-\d{4}-\d{6}$/),
  }),
  z.object({ action: z.literal("CLOSE") }),
]);

export type ScrutinyActionInput = z.infer<typeof scrutinyActionSchema>;
