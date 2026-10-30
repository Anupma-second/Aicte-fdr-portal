import type { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { ApiError, handler } from "@/lib/errors";
import { fdrScope } from "@/lib/fdr/queries";
import { getStorage } from "@/lib/storage";

export const GET = handler(async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
  const user = await requireRole();
  const { id } = await context.params;

  const document = await db.fdrDocument.findFirst({ where: { id, fdr: fdrScope(user) } });
  if (!document) throw new ApiError(404, "NOT_FOUND", "Document not found");

  const file = await getStorage().get(document);
  const disposition = request.nextUrl.searchParams.get("download") ? "attachment" : "inline";
  // Name was sanitised on upload; encoding also keeps any leftover characters out of the header.
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": document.mimeType,
      "Content-Length": String(file.length),
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(document.originalName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
