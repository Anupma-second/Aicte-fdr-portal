import ExcelJS from "exceljs";
import type { Report } from "./data";

const NAVY = "FF0D1B45";

export async function reportToExcel(report: Report): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.created = report.generatedAt;
  const sheet = workbook.addWorksheet(report.title.slice(0, 31), { views: [{ state: "frozen", ySplit: 1 }] });

  sheet.columns = report.columns.map((column) => ({
    key: column.key,
    header: column.header,
    width: column.width,
    style: column.kind === "amount" ? { numFmt: "#,##0.00" } : undefined,
  }));
  sheet.addRows(report.rows);

  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: report.columns.length } };

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
