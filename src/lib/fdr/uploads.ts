import { ApiError } from "@/lib/errors";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_UPLOADS = "application/pdf,image/png,image/jpeg";

export type CheckedUpload = { buffer: Buffer; mimeType: string; originalName: string };

/** The file's real type from its first bytes. The browser's claimed type and the extension can be faked. */
export function sniffMimeType(buffer: Buffer): string | null {
  if (buffer.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return "image/jpeg";
  return null;
}

export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const clean = base.replace(/[^\w.\- ]/g, "_").replace(/^\.+/, "").trim().slice(-200);
  return clean || "document";
}

export async function checkUpload(file: File): Promise<CheckedUpload> {
  if (file.size === 0) throw new ApiError(400, "FILE_EMPTY", "The file is empty");
  if (file.size > MAX_UPLOAD_BYTES) throw new ApiError(413, "FILE_TOO_LARGE", "Files can be up to 10 MB");
  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = sniffMimeType(buffer);
  if (!mimeType) throw new ApiError(415, "FILE_TYPE", "Only PDF, PNG and JPEG files are accepted");
  return { buffer, mimeType, originalName: sanitizeFileName(file.name) };
}

/** Stops an oversized body being read into memory. */
export function assertRequestSize(request: Request): void {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_UPLOAD_BYTES + 256 * 1024) throw new ApiError(413, "FILE_TOO_LARGE", "Files can be up to 10 MB");
}
