import type { FdrStatus } from "@prisma/client";

const DAY_MS = 24 * 60 * 60 * 1000;
const EXPIRING_WITHIN_DAYS = 90;
const FINISHED: FdrStatus[] = ["RENEWED", "REPLACED", "RELEASED", "CLOSED"];

export type Validity = "VALID" | "EXPIRING" | "MATURED" | "FINISHED";

function utcMidnight(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/** Whole calendar days from `now` to `date`; negative once the date has passed. */
export function daysUntil(date: Date, now = new Date()): number {
  return Math.round((utcMidnight(date) - utcMidnight(now)) / DAY_MS);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** Calculated from the dates every time, so it can't go stale the way a stored value could. */
export function getValidity(status: FdrStatus, maturityDate: Date, now = new Date()): Validity {
  if (FINISHED.includes(status)) return "FINISHED";
  const days = daysUntil(maturityDate, now);
  if (days < 0) return "MATURED";
  return days <= EXPIRING_WITHIN_DAYS ? "EXPIRING" : "VALID";
}
