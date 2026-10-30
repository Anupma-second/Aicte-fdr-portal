import { FdrStatus, Prisma, RiskLevel, TrustLevel } from "@prisma/client";
import { notFound } from "next/navigation";
import type { SessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";

export const PAGE_SIZE = 20;
const SORT_FIELDS = ["referenceNo", "amount", "maturityDate", "riskScore", "status"] as const;
export type SortField = (typeof SORT_FIELDS)[number];

/** Institutions see only their own FDRs. Staff roles see all of them. */
export function fdrScope(user: Pick<SessionUser, "role" | "institutionId">): Prisma.FdrWhereInput {
  return user.role === "INSTITUTION" ? { institutionId: user.institutionId ?? "__none__" } : {};
}

export type FdrListParams = {
  q: string;
  status: FdrStatus | "";
  trust: TrustLevel | "";
  risk: RiskLevel | "";
  sort: SortField;
  dir: "asc" | "desc";
  page: number;
};

function pick<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return allowed.includes(value as T) ? (value as T) : undefined;
}

/** Anything unrecognised in the URL falls back to a default rather than reaching the query. */
export function parseFdrListParams(params: Record<string, string | string[] | undefined>): FdrListParams {
  const page = Number(params.page);
  return {
    q: typeof params.q === "string" ? params.q.trim().slice(0, 100) : "",
    status: pick(params.status, Object.values(FdrStatus)) ?? "",
    trust: pick(params.trust, Object.values(TrustLevel)) ?? "",
    risk: pick(params.risk, Object.values(RiskLevel)) ?? "",
    sort: pick(params.sort, SORT_FIELDS) ?? "maturityDate",
    dir: pick(params.dir, ["asc", "desc"] as const) ?? "asc",
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

export async function listFdrs(user: SessionUser, params: FdrListParams) {
  const where: Prisma.FdrWhereInput = {
    AND: [
      fdrScope(user),
      params.status ? { status: params.status } : {},
      params.trust ? { trustLevel: params.trust } : {},
      params.risk ? { riskLevel: params.risk } : {},
      params.q
        ? {
            OR: [
              { referenceNo: { contains: params.q } },
              { fdrNumber: { contains: params.q } },
              { bankName: { contains: params.q } },
              ...(user.role === "INSTITUTION" ? [] : [{ institution: { name: { contains: params.q } } }]),
            ],
          }
        : {},
    ],
  };
  const [total, rows] = await Promise.all([
    db.fdr.count({ where }),
    db.fdr.findMany({
      where,
      orderBy: [{ [params.sort]: params.dir }, { referenceNo: "asc" }],
      skip: (params.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { institution: { select: { name: true } } },
    }),
  ]);
  return { total, rows, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export async function getFdrDetail(user: SessionUser, fdrId: string) {
  const fdr = await db.fdr.findFirst({
    where: { id: fdrId, ...fdrScope(user) },
    include: {
      institution: { select: { name: true, aicteCode: true, state: true } },
      documents: {
        orderBy: [{ type: "asc" }, { version: "desc" }],
        include: { ocr: true, uploadedBy: { select: { name: true } } },
      },
      events: { orderBy: { occurredAt: "desc" }, include: { actor: { select: { name: true } } } },
      discrepancies: { orderBy: { createdAt: "desc" } },
      bankVerifications: { orderBy: { createdAt: "desc" }, take: 1 },
      releaseRequests: { orderBy: { requestedAt: "desc" }, take: 1, include: { decidedBy: { select: { name: true } } } },
    },
  });
  if (!fdr) notFound();
  return fdr;
}

/** Internal officer notes. Never send these to institution users. */
export function getObservations(fdrId: string) {
  return db.scrutinyObservation.findMany({
    where: { fdrId },
    orderBy: { createdAt: "desc" },
    include: { officer: { select: { name: true } } },
  });
}

const CHAIN_LIMIT = 50;

/** Every FDR in this deposit's renewal chain, oldest first. Links are one-to-one, so this is a straight line. */
export async function getRenewalChain(fdrId: string) {
  const chainSelect = {
    id: true,
    referenceNo: true,
    status: true,
    trustLevel: true,
    amount: true,
    bankName: true,
    maturityDate: true,
    renewedFrom: { select: { oldFdrId: true, type: true } },
    renewedTo: { select: { newFdrId: true, type: true } },
  } as const;
  const load = (id: string) => db.fdr.findUniqueOrThrow({ where: { id }, select: chainSelect });

  const start = await load(fdrId);
  const chain = [start];
  for (let previous = start.renewedFrom; previous && chain.length < CHAIN_LIMIT; ) {
    const fdr = await load(previous.oldFdrId);
    chain.unshift(fdr);
    previous = fdr.renewedFrom;
  }
  for (let next = start.renewedTo; next && chain.length < CHAIN_LIMIT; ) {
    const fdr = await load(next.newFdrId);
    chain.push(fdr);
    next = fdr.renewedTo;
  }
  return chain;
}
