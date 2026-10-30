import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { handler } from "@/lib/errors";
import { performScrutinyAction } from "@/lib/fdr/scrutiny";
import { scrutinyActionSchema } from "@/lib/validation/scrutiny";

export const POST = handler(async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
  const user = await requireRole("SCRUTINY_OFFICER");
  const { id } = await context.params;
  const input = scrutinyActionSchema.parse(await request.json());
  return NextResponse.json(await performScrutinyAction(user, id, input));
});
