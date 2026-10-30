import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { handler } from "@/lib/errors";
import { performReleaseAction } from "@/lib/fdr/release";
import { releaseActionSchema } from "@/lib/validation/alerts";

export const POST = handler(async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
  const user = await requireRole("SCRUTINY_OFFICER", "COMPETENT_AUTHORITY");
  const { id } = await context.params;
  const { action, note } = releaseActionSchema.parse(await request.json());
  await performReleaseAction(user, id, action, note);
  return NextResponse.json({ ok: true });
});
