import { SignJWT, jwtVerify } from "jose";
import { parseFdrText, type ExtractedFields } from "@/lib/fdr/parse-ocr";
import { extractText } from "./index";

const MAX_STORED_TEXT = 8000;
const TOKEN_AUDIENCE = "ocr-result";

export type ScanAnalysis = {
  status: "COMPLETED" | "FAILED";
  rawText: string | null;
  confidence: number | null;
  fields: ExtractedFields | null;
};

export async function analyzeScan(file: Buffer, mimeType: string): Promise<ScanAnalysis> {
  try {
    const { text, confidence } = await extractText(file, mimeType);
    return { status: "COMPLETED", rawText: text.slice(0, MAX_STORED_TEXT), confidence, fields: parseFdrText(text) };
  } catch (error) {
    console.error("OCR failed", error);
    return { status: "FAILED", rawText: null, confidence: null, fields: null };
  }
}

function secret() {
  return new TextEncoder().encode(process.env.JWT_SECRET);
}

/**
 * The form reads a scan before the FDR exists. This signed token lets the submission
 * reuse that result without running OCR twice, and without trusting values from the browser.
 */
export function signAnalysis(analysis: ScanAnalysis, sha256: string): Promise<string> {
  return new SignJWT({ analysis, sha256 })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(TOKEN_AUDIENCE)
    .setExpirationTime("1h")
    .sign(secret());
}

/** Returns null unless the token is genuine and was issued for exactly this file. */
export async function readAnalysisToken(token: string | null, sha256: string): Promise<ScanAnalysis | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"], audience: TOKEN_AUDIENCE });
    return payload.sha256 === sha256 ? (payload.analysis as ScanAnalysis) : null;
  } catch {
    return null;
  }
}
