import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { handler } from "@/lib/errors";
import { respondToDiscrepancy } from "@/lib/fdr/service";
import { discrepancyResponseSchema } from "@/lib/validation/fdr";

export const POST = handler(
  async (request: NextRequest, context: { params: Promise<{ id: string; discrepancyId: string }> }) => {
    const user = await requireRole("INSTITUTION");
    const { id, discrepancyId } = await context.params;
    const { response } = discrepancyResponseSchema.parse(await request.json());
    const updated = await respondToDiscrepancy(user, id, discrepancyId, response);
    return NextResponse.json({ status: updated.status });
  },
);
