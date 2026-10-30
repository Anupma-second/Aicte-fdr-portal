import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { handler } from "@/lib/errors";
import { requestRelease } from "@/lib/fdr/release";
import { releaseRequestSchema } from "@/lib/validation/alerts";

export const POST = handler(async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
  const user = await requireRole("INSTITUTION");
  const { id } = await context.params;
  const { reason } = releaseRequestSchema.parse(await request.json());
  const created = await requestRelease(user, id, reason);
  return NextResponse.json({ id: created.id }, { status: 201 });
});
