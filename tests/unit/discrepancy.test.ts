import { describe, expect, it } from "vitest";
import { detectDiscrepancies, type DetectionInput } from "@/lib/fdr/discrepancy";
import { sanitizeFileName, sniffMimeType } from "@/lib/fdr/uploads";

const clean: DetectionInput = {
  amount: "500000.00",
  bankName: "HDFC Bank",
  issueDate: new Date("2025-01-01"),
  maturityDate: new Date("2028-01-01"),
  ifscCode: "HDFC0001234",
  hasCurrentScan: true,
  ocr: { amount: "500000", bankName: "HDFC Bank Ltd" },
  duplicateElsewhere: false,
};
const types = (input: Partial<DetectionInput>) => detectDiscrepancies({ ...clean, ...input }).map((item) => item.type);

describe("discrepancy rules", () => {
  it("finds nothing on a clean FDR, allowing for formatting differences", () => {
    expect(types({})).toEqual([]);
  });

  it("flags a missing scan", () => {
    expect(types({ hasCurrentScan: false, ocr: null })).toEqual(["MISSING_DOCUMENT"]);
  });

  it("flags maturity on or before issue", () => {
    expect(types({ maturityDate: new Date("2024-01-01") })).toEqual(["MATURITY_BEFORE_ISSUE"]);
    expect(types({ maturityDate: new Date("2025-01-01") })).toEqual(["MATURITY_BEFORE_ISSUE"]);
  });

  it("flags an amount mismatch and keeps both values", () => {
    const [found] = detectDiscrepancies({ ...clean, ocr: { amount: "450000", bankName: "HDFC Bank" } });
    expect(found).toMatchObject({ type: "AMOUNT_MISMATCH", declaredValue: "500000.00", extractedValue: "450000" });
  });

  it("flags a different bank", () => {
    expect(types({ ocr: { amount: "500000", bankName: "Axis Bank" } })).toEqual(["BANK_MISMATCH"]);
  });

  it("doesn't flag a mismatch when OCR couldn't read the value", () => {
    expect(types({ ocr: { amount: null, bankName: null } })).toEqual([]);
    expect(types({ ocr: null })).toEqual([]);
  });

  it("flags duplicates and a missing IFSC", () => {
    expect(types({ duplicateElsewhere: true })).toEqual(["DUPLICATE_FDR_NUMBER"]);
    expect(types({ ifscCode: null })).toEqual(["MISSING_FIELD"]);
  });
});

describe("upload checks", () => {
  it("identifies files from their content, not their name", () => {
    expect(sniffMimeType(Buffer.from("%PDF-1.7 ..."))).toBe("application/pdf");
    expect(sniffMimeType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffMimeType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(sniffMimeType(Buffer.from("<html><script>alert(1)</script>"))).toBeNull();
    expect(sniffMimeType(Buffer.from("MZ executable"))).toBeNull();
  });

  it("strips paths and unsafe characters from file names", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFileName("C:\\Users\\me\\scan.pdf")).toBe("scan.pdf");
    expect(sanitizeFileName('a"b<c>.pdf')).toBe("a_b_c_.pdf");
    expect(sanitizeFileName("...")).toBe("document");
  });
});
