import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { ApiError, handler } from "@/lib/errors";
import { assertRequestSize, checkUpload } from "@/lib/fdr/uploads";
import { analyzeScan, signAnalysis } from "@/lib/ocr/analyze";
import { sha256Hex } from "@/lib/storage/crypto";

const MAX_SCANS = 40;

/** Reads a scan so the form can pre-fill. Nothing is stored until the FDR is submitted. */
export const POST = handler(async (request: NextRequest) => {
  const user = await requireRole("INSTITUTION");
  await consumeRateLimit("ocr", user.id, MAX_SCANS);
  assertRequestSize(request);

  const file = (await request.formData()).get("file");
  if (!(file instanceof File)) throw new ApiError(400, "FILE_REQUIRED", "Choose a file");
  const upload = await checkUpload(file);

  const analysis = await analyzeScan(upload.buffer, upload.mimeType);
  return NextResponse.json({
    status: analysis.status,
    confidence: analysis.confidence,
    fields: analysis.fields,
    token: await signAnalysis(analysis, sha256Hex(upload.buffer)),
  });
});
