import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { handler } from "@/lib/errors";

export const GET = handler(async () => {
  const user = await requireRole();
  return NextResponse.json({ user });
});
