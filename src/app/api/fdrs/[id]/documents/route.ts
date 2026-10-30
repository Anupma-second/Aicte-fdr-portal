import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { ApiError, handler } from "@/lib/errors";
import { addDocument } from "@/lib/fdr/service";
import { assertRequestSize, checkUpload } from "@/lib/fdr/uploads";
import { documentTypeSchema } from "@/lib/validation/fdr";

export const POST = handler(async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
  const user = await requireRole("INSTITUTION");
  const { id } = await context.params;
  assertRequestSize(request);

  const form = await request.formData();
  const type = documentTypeSchema.parse(form.get("type"));
  const file = form.get("file");
  if (!(file instanceof File)) throw new ApiError(400, "FILE_REQUIRED", "Choose a file");

  const document = await addDocument(user, id, type, await checkUpload(file));
  return NextResponse.json({ id: document.id, version: document.version }, { status: 201 });
});
