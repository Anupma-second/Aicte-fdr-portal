import { describe, expect, it } from "vitest";
import { parseDate, parseFdrText } from "@/lib/fdr/parse-ocr";

const RECEIPT = `STATE BANK OF INDIA
FIXED DEPOSIT RECEIPT
FDR No: 45100234987
Branch: Pune Station Road
IFSC: SBIN0123456
Deposit Amount: Rs. 5,00,000.00
Maturity Value: Rs. 6,50,000.00
Date of Issue: 12/01/2025
Maturity Date: 12-01-2028`;

describe("parseFdrText", () => {
  it("reads every field from a typical receipt", () => {
    expect(parseFdrText(RECEIPT)).toEqual({
      fdrNumber: "45100234987",
      bankName: "State Bank of India",
      branchName: "Pune Station Road",
      ifscCode: "SBIN0123456",
      amount: "500000",
      issueDate: "2025-01-12",
      maturityDate: "2028-01-12",
    });
  });

  it("takes the principal, not the larger maturity value", () => {
    expect(parseFdrText("Maturity Value: Rs. 9,00,000\nPrincipal: Rs. 2,00,000").amount).toBe("200000");
  });

  it("doesn't report Central Bank of India as Bank of India", () => {
    expect(parseFdrText("CENTRAL BANK OF INDIA").bankName).toBe("Central Bank of India");
  });

  it("returns nulls rather than guessing", () => {
    expect(parseFdrText("nothing useful here")).toEqual({
      fdrNumber: null,
      bankName: null,
      branchName: null,
      ifscCode: null,
      amount: null,
      issueDate: null,
      maturityDate: null,
    });
  });

  it("handles named months and other labels", () => {
    const fields = parseFdrText("Receipt No. AB/1234\nAmount: INR 75000\nDate of Deposit: 3 Mar 2024\nDue Date: 3 March 2027");
    expect(fields.fdrNumber).toBe("AB/1234");
    expect(fields.amount).toBe("75000");
    expect(fields.issueDate).toBe("2024-03-03");
    expect(fields.maturityDate).toBe("2027-03-03");
  });
});

describe("parseDate", () => {
  it("reads day first", () => {
    expect(parseDate("03/04/2026")).toBe("2026-04-03");
  });

  it("rejects impossible dates", () => {
    expect(parseDate("31/02/2026")).toBeNull();
    expect(parseDate("not a date")).toBeNull();
  });
});
