import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { handler } from "@/lib/errors";
import { updateFdr } from "@/lib/fdr/service";
import { fdrInputSchema } from "@/lib/validation/fdr";

export const PATCH = handler(async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
  const user = await requireRole("INSTITUTION");
  const { id } = await context.params;
  const fdr = await updateFdr(user, id, fdrInputSchema.parse(await request.json()));
  return NextResponse.json({ id: fdr.id });
});
