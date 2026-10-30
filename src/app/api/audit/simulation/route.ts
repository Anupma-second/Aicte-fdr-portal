import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { startSimulation, stopSimulation } from "@/lib/audit/simulation";
import { requireRole } from "@/lib/auth/guards";
import { handler } from "@/lib/errors";

const schema = z.object({ action: z.enum(["START", "STOP"]) });

export const POST = handler(async (request: NextRequest) => {
  const user = await requireRole("ADMIN");
  const { action } = schema.parse(await request.json());
  if (action === "START") return NextResponse.json({ entryId: await startSimulation(user) });
  await stopSimulation(user);
  return NextResponse.json({ ok: true });
});
