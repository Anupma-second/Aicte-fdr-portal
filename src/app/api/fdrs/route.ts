import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { ApiError, handler } from "@/lib/errors";
import { createFdr } from "@/lib/fdr/service";
import { assertRequestSize, checkUpload } from "@/lib/fdr/uploads";
import { fdrInputSchema } from "@/lib/validation/fdr";

export const POST = handler(async (request: NextRequest) => {
  const user = await requireRole("INSTITUTION");
  assertRequestSize(request);

  const form = await request.formData();
  let data: unknown;
  try {
    data = JSON.parse(String(form.get("data")));
  } catch {
    throw new ApiError(400, "VALIDATION_ERROR", "Invalid input");
  }
  const input = fdrInputSchema.parse(data);
  const scan = form.get("scan");
  const token = form.get("ocrToken");

  const fdr = await createFdr(
    user,
    input,
    scan instanceof File ? await checkUpload(scan) : null,
    typeof token === "string" ? token : null,
  );
  return NextResponse.json({ id: fdr.id, referenceNo: fdr.referenceNo }, { status: 201 });
});
