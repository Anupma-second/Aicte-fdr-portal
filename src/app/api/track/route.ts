import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { db } from "@/lib/db";
import { ApiError, handler } from "@/lib/errors";
import { getValidity } from "@/lib/fdr/dates";

const schema = z.object({
  referenceNo: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^FDR-\d{4}-\d{6}$/),
});

const MAX_LOOKUPS = 30;

export const POST = handler(async (request: NextRequest) => {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  await consumeRateLimit("track", ip, MAX_LOOKUPS);

  const { referenceNo } = schema.parse(await request.json());

  // This endpoint is public: never select amount, institution, bank or FDR number.
  const fdr = await db.fdr.findUnique({
    where: { referenceNo },
    select: { referenceNo: true, status: true, trustLevel: true, maturityDate: true, statusChangedAt: true },
  });
  if (!fdr) throw new ApiError(404, "NOT_FOUND", "No FDR with this reference number");

  return NextResponse.json({
    referenceNo: fdr.referenceNo,
    status: fdr.status,
    trustLevel: fdr.trustLevel,
    validity: getValidity(fdr.status, fdr.maturityDate),
    lastUpdated: fdr.statusChangedAt.toISOString(),
  });
});
