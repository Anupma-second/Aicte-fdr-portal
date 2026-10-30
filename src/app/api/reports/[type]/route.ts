import type { NextRequest } from "next/server";
import { z } from "zod";
import { appendAudit } from "@/lib/audit/chain";
import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { handler } from "@/lib/errors";
import { REPORT_TYPES, getReport } from "@/lib/reports/data";
import { reportToExcel } from "@/lib/reports/excel";
import { reportToPdf } from "@/lib/reports/pdf";

const paramsSchema = z.object({ type: z.enum(REPORT_TYPES), format: z.enum(["xlsx", "pdf"]) });

const CONTENT_TYPES = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
};

export const GET = handler(async (request: NextRequest, context: { params: Promise<{ type: string }> }) => {
  const user = await requireRole("SCRUTINY_OFFICER", "COMPETENT_AUTHORITY", "ADMIN");
  const { type, format } = paramsSchema.parse({
    type: (await context.params).type,
    format: request.nextUrl.searchParams.get("format"),
  });

  const report = await getReport(type);
  const file = format === "xlsx" ? await reportToExcel(report) : await reportToPdf(report);
  // Bulk exports take data out of the portal, so they're recorded even though nothing changes.
  await db.$transaction((tx) =>
    appendAudit(tx, {
      actorId: user.id,
      actorLabel: user.email,
      action: "REPORT_EXPORTED",
      entityType: "Report",
      entityId: type,
      payload: { format, rows: report.rows.length },
    }),
  );

  const stamp = report.generatedAt.toISOString().slice(0, 10);
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": CONTENT_TYPES[format],
      "Content-Disposition": `attachment; filename="fdr-${type}-${stamp}.${format}"`,
      "Cache-Control": "private, no-store",
    },
  });
});
