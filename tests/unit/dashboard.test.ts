import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildTrend } from "@/lib/dashboard/authority";
import { canAccessPath } from "@/lib/rbac";
import type { Report } from "@/lib/reports/data";
import { reportToExcel } from "@/lib/reports/excel";
import { reportToPdf } from "@/lib/reports/pdf";

const NOW = new Date("2026-10-15T00:00:00Z");

describe("turnaround trend", () => {
  it("averages days per month verified", () => {
    const trend = buildTrend(
      [
        { submittedAt: new Date("2026-10-01"), verifiedAt: new Date("2026-10-05") },
        { submittedAt: new Date("2026-10-01"), verifiedAt: new Date("2026-10-11") },
        { submittedAt: new Date("2026-09-01"), verifiedAt: new Date("2026-09-03") },
      ],
      NOW,
    );
    expect(trend).toHaveLength(6);
    expect(trend[5]).toEqual({ month: "2026-10", days: 7, cases: 2 });
    expect(trend[4]).toEqual({ month: "2026-09", days: 2, cases: 1 });
  });

  it("leaves a month with no cases empty, rather than showing zero days", () => {
    expect(buildTrend([], NOW)[0]).toEqual({ month: "2026-05", days: null, cases: 0 });
  });

  it("ignores anything older than the window", () => {
    const trend = buildTrend([{ submittedAt: new Date("2020-01-01"), verifiedAt: new Date("2020-01-05") }], NOW);
    expect(trend.every((point) => point.cases === 0)).toBe(true);
  });
});

const report: Report = {
  type: "pending",
  title: "Sample report",
  generatedAt: NOW,
  columns: [
    { key: "reference", header: "Reference", width: 18 },
    { key: "amount", header: "Amount", width: 12, kind: "amount" },
  ],
  rows: Array.from({ length: 80 }, (_, index) => ({ reference: `FDR-${index}`, amount: 100000 + index })),
};

describe("report files", () => {
  it("writes a real Excel file", async () => {
    const file = await reportToExcel(report);
    expect(file.subarray(0, 2).toString()).toBe("PK");
  });

  it("writes a real PDF, across pages when long", async () => {
    const file = await reportToPdf(report);
    expect(file.subarray(0, 5).toString()).toBe("%PDF-");
    expect((file.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThan(1);
  });

  it("doesn't add blank pages", async () => {
    const pageCount = (file: Buffer) => (file.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;
    expect(pageCount(await reportToPdf({ ...report, rows: report.rows.slice(0, 5) }))).toBe(1);
    // 25 rows fit on a page, so 80 rows need exactly 4.
    expect(pageCount(await reportToPdf(report))).toBe(Math.ceil(80 / 25));
  });

  it("writes a PDF for an empty report", async () => {
    expect((await reportToPdf({ ...report, rows: [] })).subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("doesn't treat a formula-like value as a formula", async () => {
    const file = await reportToExcel({ ...report, rows: [{ reference: "=1+1", amount: 1 }] });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file as unknown as ArrayBuffer);
    expect(workbook.worksheets[0].getCell("A2").value).toBe("=1+1");
  });
});

describe("access to the new areas", () => {
  it("keeps reports and audit APIs away from institutions", () => {
    expect(canAccessPath("INSTITUTION", "/api/reports/overdue")).toBe(false);
    expect(canAccessPath("SCRUTINY_OFFICER", "/api/reports/overdue")).toBe(true);
    expect(canAccessPath("SCRUTINY_OFFICER", "/api/audit/verify")).toBe(false);
    expect(canAccessPath("COMPETENT_AUTHORITY", "/api/audit/verify")).toBe(true);
  });
});
