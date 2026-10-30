import { z } from "zod";

export const releaseRequestSchema = z.object({ reason: z.string().trim().min(10).max(2000) });

export const releaseActionSchema = z.object({
  action: z.enum(["ADVANCE", "APPROVE", "REJECT", "CLOSE"]),
  note: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((value) => value || undefined),
});

export const createAlertRuleSchema = z
  .object({
    kind: z.enum(["REMINDER", "ESCALATION"]),
    days: z.coerce.number().int().min(1).max(365),
    targetLevel: z.enum(["INSTITUTION", "SCRUTINY_OFFICER", "COMPETENT_AUTHORITY"]),
  })
  .refine((rule) => rule.kind === "ESCALATION" || rule.targetLevel === "INSTITUTION", {
    message: "Reminders go to the institution",
    path: ["targetLevel"],
  });

export const updateAlertRuleSchema = z.object({ isActive: z.boolean() });
