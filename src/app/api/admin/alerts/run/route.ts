import { NextResponse } from "next/server";
import { runAlertJob } from "@/lib/alerts/job";
import { requireRole } from "@/lib/auth/guards";
import { handler } from "@/lib/errors";

/** Runs the daily job now, for demos. Repeat runs send nothing new. */
export const POST = handler(async () => {
  await requireRole("ADMIN");
  return NextResponse.json(await runAlertJob());
});
