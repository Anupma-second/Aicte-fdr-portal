import { NextResponse } from "next/server";
import { verifyAuditChain } from "@/lib/audit/chain";
import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { handler } from "@/lib/errors";

export const GET = handler(async () => {
  await requireRole("COMPETENT_AUTHORITY", "ADMIN");
  return NextResponse.json(await verifyAuditChain(db), { headers: { "Cache-Control": "no-store" } });
});
