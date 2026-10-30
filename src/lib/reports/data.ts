import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { addDays, daysUntil } from "@/lib/fdr/dates";

export const REPORT_TYPES = ["pending", "upcoming", "missing", "overdue", "region"] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export type ReportColumn = { key: string; header: string; width: number; kind?: "amount" | "number" };
export type ReportRow = Record<string, string | number>;
export type Report = { type: ReportType; title: string; columns: ReportColumn[]; rows: ReportRow[]; generatedAt: Date };

const UPCOMING_DAYS = 90;
const IN_PROGRESS = ["SUBMITTED", "UNDER_SCRUTINY", "DISCREPANCY_RAISED"] as const;
const LIVE = ["ACTIVE", "EXPIRING", "MATURED"] as const;
const FINISHED = ["RENEWED", "REPLACED", "RELEASED", "CLOSED"] as const;

const TITLES: Record<ReportType, string> = {
  pending: "Pending verifications",
  upcoming: `Maturities in the next ${UPCOMING_DAYS} days`,
  missing: "FDRs with missing documents",
  overdue: "Overdue FDRs",
  region: "Region-wise summary",
};

const FDR_COLUMNS: ReportColumn[] = [
  { key: "reference", header: "Reference", width: 18 },
  { key: "institution", header: "Institution", width: 38 },
  { key: "state", header: "State", width: 16 },
  { key: "bank", header: "Bank", width: 24 },
  { key: "amount", header: "Amount (Rs.)", width: 14, kind: "amount" },
  { key: "maturity", header: "Maturity", width: 12 },
  { key: "status", header: "Status", width: 18 },
  { key: "trust", header: "Trust", width: 18 },
  { key: "risk", header: "Risk", width: 8, kind: "number" },
];

const include = { institution: { select: { name: true, state: true } } } as const;
type FdrWithInstitution = Prisma.FdrGetPayload<{ include: typeof include }>;

function label(value: string): string {
  const words = value.toLowerCase().replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function fdrRow(fdr: FdrWithInstitution): ReportRow {
  return {
    reference: fdr.referenceNo,
    institution: fdr.institution.name,
    state: fdr.institution.state,
    bank: fdr.bankName,
    amount: Number(fdr.amount),
    maturity: fdr.maturityDate.toISOString().slice(0, 10),
    status: label(fdr.status),
    trust: label(fdr.trustLevel),
    risk: fdr.riskScore,
  };
}

async function fdrReport(type: ReportType, where: Prisma.FdrWhereInput, orderBy: Prisma.FdrOrderByWithRelationInput, extra?: { column: ReportColumn; value: (fdr: FdrWithInstitution) => string | number }): Promise<Report> {
  const fdrs = await db.fdr.findMany({ where, orderBy, include });
  return {
    type,
    title: TITLES[type],
    columns: extra ? [...FDR_COLUMNS, extra.column] : FDR_COLUMNS,
    rows: fdrs.map((fdr) => (extra ? { ...fdrRow(fdr), [extra.column.key]: extra.value(fdr) } : fdrRow(fdr))),
    generatedAt: new Date(),
  };
}

async function regionReport(now: Date): Promise<Report> {
  const fdrs = await db.fdr.findMany({
    select: { status: true, amount: true, maturityDate: true, institution: { select: { region: true, id: true } } },
  });
  const institutions = await db.institution.groupBy({ by: ["region"], _count: { _all: true } });
  const totals = new Map<string, { fdrs: number; amount: number; live: number; expiring: number; overdue: number; pending: number }>();
  for (const row of institutions) totals.set(row.region, { fdrs: 0, amount: 0, live: 0, expiring: 0, overdue: 0, pending: 0 });

  for (const fdr of fdrs) {
    const total = totals.get(fdr.institution.region);
    if (!total) continue;
    const finished = (FINISHED as readonly string[]).includes(fdr.status);
    const days = daysUntil(fdr.maturityDate, now);
    total.fdrs += 1;
    if (!finished) total.amount += Number(fdr.amount);
    if ((LIVE as readonly string[]).includes(fdr.status)) {
      total.live += 1;
      if (days < 0) total.overdue += 1;
      else if (days <= UPCOMING_DAYS) total.expiring += 1;
    }
    if ((IN_PROGRESS as readonly string[]).includes(fdr.status)) total.pending += 1;
  }

  return {
    type: "region",
    title: TITLES.region,
    generatedAt: now,
    columns: [
      { key: "region", header: "Region", width: 16 },
      { key: "institutions", header: "Institutions", width: 12, kind: "number" },
      { key: "fdrs", header: "FDRs", width: 10, kind: "number" },
      { key: "amount", header: "Amount held (Rs.)", width: 18, kind: "amount" },
      { key: "live", header: "Live", width: 10, kind: "number" },
      { key: "expiring", header: "Expiring", width: 10, kind: "number" },
      { key: "overdue", header: "Overdue", width: 10, kind: "number" },
      { key: "pending", header: "Pending", width: 10, kind: "number" },
    ],
    rows: institutions
      .map((row) => ({ region: label(row.region), institutions: row._count._all, ...totals.get(row.region)! }))
      .sort((a, b) => b.amount - a.amount),
  };
}

export async function getReport(type: ReportType, now = new Date()): Promise<Report> {
  switch (type) {
    case "pending":
      return fdrReport(type, { status: { in: [...IN_PROGRESS] } }, { submittedAt: "asc" }, {
        column: { key: "waiting", header: "Waiting (days)", width: 16, kind: "number" },
        value: (fdr) => -daysUntil(fdr.submittedAt, now),
      });
    case "upcoming":
      return fdrReport(type, { status: { in: [...LIVE] }, maturityDate: { gte: now, lte: addDays(now, UPCOMING_DAYS) } }, { maturityDate: "asc" }, {
        column: { key: "daysLeft", header: "Days left", width: 13, kind: "number" },
        value: (fdr) => daysUntil(fdr.maturityDate, now),
      });
    case "missing":
      return fdrReport(type, { status: { notIn: [...FINISHED] }, documents: { none: { type: "FDR_SCAN", isCurrent: true } } }, { submittedAt: "asc" });
    case "overdue":
      return fdrReport(type, { status: { in: [...LIVE] }, maturityDate: { lt: now } }, { maturityDate: "asc" }, {
        column: { key: "daysOverdue", header: "Days overdue", width: 16, kind: "number" },
        value: (fdr) => -daysUntil(fdr.maturityDate, now),
      });
    case "region":
      return regionReport(now);
  }
}
