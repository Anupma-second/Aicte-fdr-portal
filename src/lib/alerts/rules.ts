import type { AlertRule } from "@prisma/client";

export type RuleLike = Pick<AlertRule, "id" | "kind" | "days" | "targetLevel">;

/**
 * The reminder tier an FDR is in right now. If the job misses some days, only the
 * tightest tier fires, so nobody gets a pile of out-of-date reminders at once.
 */
export function dueReminder<T extends RuleLike>(daysToMaturity: number, rules: T[]): T | null {
  if (daysToMaturity < 0) return null;
  return (
    rules
      .filter((rule) => rule.kind === "REMINDER" && rule.days >= daysToMaturity)
      .sort((a, b) => a.days - b.days)[0] ?? null
  );
}

/** Every escalation rung an overdue FDR has reached, lowest first. */
export function dueEscalations<T extends RuleLike>(daysToMaturity: number, rules: T[]): T[] {
  if (daysToMaturity >= 0) return [];
  const overdue = -daysToMaturity;
  return rules
    .filter((rule) => rule.kind === "ESCALATION" && rule.days <= overdue)
    .sort((a, b) => a.days - b.days);
}
