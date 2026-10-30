import { db } from "@/lib/db";
import { daysUntil } from "@/lib/fdr/dates";
import { HOURS_SAVED_PER_FDR } from "@/lib/landing";

const LIVE = ["ACTIVE", "EXPIRING", "MATURED"] as const;
const FINISHED = ["RENEWED", "REPLACED", "RELEASED", "CLOSED"];
const TREND_MONTHS = 6;
const TOP_STATES = 8;
const DAY_MS = 86_400_000;

export const STATUS_GROUPS = {
  active: ["VERIFIED", "ACTIVE"],
  expiring: ["EXPIRING"],
  matured: ["MATURED"],
  renewed: ["RENEWED", "REPLACED"],
  released: ["RELEASED", "CLOSED"],
  pending: ["SUBMITTED", "UNDER_SCRUTINY", "DISCREPANCY_RAISED", "RELEASE_REQUESTED"],
} as const;
export type StatusGroup = keyof typeof STATUS_GROUPS;

export type TrendPoint = { month: string; days: number | null; cases: number };

/** Average days from submission to verification, per month verified. A month with no cases stays empty. */
export function buildTrend(rows: { submittedAt: Date; verifiedAt: Date }[], now: Date, months = TREND_MONTHS): TrendPoint[] {
  const buckets = Array.from({ length: months }, (_, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1 - index), 1));
    return { key: date.toISOString().slice(0, 7), total: 0, cases: 0 };
  });
  for (const row of rows) {
    const bucket = buckets.find((item) => item.key === row.verifiedAt.toISOString().slice(0, 7));
    if (!bucket) continue;
    bucket.total += (row.verifiedAt.getTime() - row.submittedAt.getTime()) / DAY_MS;
    bucket.cases += 1;
  }
  return buckets.map((bucket) => ({
    month: bucket.key,
    days: bucket.cases ? Math.round((bucket.total / bucket.cases) * 10) / 10 : null,
    cases: bucket.cases,
  }));
}

export async function getAuthorityDashboard(now = new Date()) {
  const [fdrs, discrepancies, approvals, escalated] = await Promise.all([
    db.fdr.findMany({
      select: {
        id: true,
        referenceNo: true,
        status: true,
        amount: true,
        maturityDate: true,
        submittedAt: true,
        verifiedAt: true,
        trustLevel: true,
        riskLevel: true,
        riskScore: true,
        riskReasons: true,
        institution: { select: { name: true, state: true, region: true } },
      },
    }),
    db.discrepancy.findMany({ select: { createdAt: true, fdr: { select: { verifiedAt: true } } } }),
    db.releaseRequest.findMany({
      where: { status: "AUTHORITY_APPROVAL" },
      orderBy: { requestedAt: "asc" },
      take: 10,
      include: { fdr: { select: { id: true, referenceNo: true, amount: true, trustLevel: true, institution: { select: { name: true } } } } },
    }),
    db.escalationLog.findMany({
      where: { toLevel: "COMPETENT_AUTHORITY", fdr: { status: { in: [...LIVE] } } },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { fdr: { select: { id: true, referenceNo: true, status: true, trustLevel: true, maturityDate: true, institution: { select: { name: true } } } } },
    }),
  ]);

  const groups = Object.fromEntries(Object.keys(STATUS_GROUPS).map((key) => [key, 0])) as Record<StatusGroup, number>;
  const regions = new Map<string, { count: number; amount: number }>();
  const states = new Map<string, number>();
  let held = 0;

  for (const fdr of fdrs) {
    for (const [group, statuses] of Object.entries(STATUS_GROUPS)) {
      if ((statuses as readonly string[]).includes(fdr.status)) groups[group as StatusGroup] += 1;
    }
    if (!FINISHED.includes(fdr.status)) {
      const amount = Number(fdr.amount);
      held += amount;
      const region = regions.get(fdr.institution.region) ?? { count: 0, amount: 0 };
      region.count += 1;
      region.amount += amount;
      regions.set(fdr.institution.region, region);
      states.set(fdr.institution.state, (states.get(fdr.institution.state) ?? 0) + amount);
    }
  }

  const overdue = fdrs
    .filter((fdr) => (LIVE as readonly string[]).includes(fdr.status) && daysUntil(fdr.maturityDate, now) < 0)
    .sort((a, b) => a.maturityDate.getTime() - b.maturityDate.getTime());

  const verified = fdrs.flatMap((fdr) => (fdr.verifiedAt ? [{ submittedAt: fdr.submittedAt, verifiedAt: fdr.verifiedAt }] : []));
  const averageDays = verified.length
    ? Math.round((verified.reduce((sum, row) => sum + (row.verifiedAt.getTime() - row.submittedAt.getTime()) / DAY_MS, 0) / verified.length) * 10) / 10
    : null;

  return {
    total: fdrs.length,
    held,
    groups,
    overdueCount: overdue.length,
    overdue: overdue.slice(0, 8),
    escalated,
    approvals,
    regions: [...regions.entries()].map(([region, value]) => ({ region, ...value })).sort((a, b) => b.amount - a.amount),
    states: [...states.entries()].map(([state, amount]) => ({ state, amount })).sort((a, b) => b.amount - a.amount).slice(0, TOP_STATES),
    trend: buildTrend(verified, now),
    kpis: {
      averageDays,
      // Found while the case was still being checked, before any deposit was accepted on it.
      caughtEarly: discrepancies.filter((item) => !item.fdr.verifiedAt || item.createdAt <= item.fdr.verifiedAt).length,
      hoursSaved: fdrs.length * HOURS_SAVED_PER_FDR,
      hoursPerFdr: HOURS_SAVED_PER_FDR,
    },
  };
}
