import PDFDocument from "pdfkit";
import type { Report, ReportColumn } from "./data";

const MARGIN = 36;
const ROW_HEIGHT = 18;
const HEADER_BOTTOM = 92;
const NAVY = "#0d1b45";
const MUTED = "#55617f";
const LINE = "#dde3f0";

function cellText(column: ReportColumn, value: string | number | undefined): string {
  if (value === undefined) return "";
  if (column.kind === "amount") return Number(value).toLocaleString("en-IN");
  return String(value);
}

/** English only: PDF's standard fonts have no Devanagari, and Excel is the editable format. */
export function reportToPdf(report: Report): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: MARGIN, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const usable = doc.page.width - MARGIN * 2;
    const totalWidth = report.columns.reduce((sum, column) => sum + column.width, 0);
    const widths = report.columns.map((column) => (column.width / totalWidth) * usable);

    function drawHeader() {
      doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(15).text(report.title, MARGIN, MARGIN, { lineBreak: false });
      doc
        .fillColor(MUTED)
        .font("Helvetica")
        .fontSize(8.5)
        .text(`AICTE FDR Portal prototype. Synthetic data. Generated ${report.generatedAt.toISOString().slice(0, 16).replace("T", " ")} UTC. ${report.rows.length} rows.`, MARGIN, MARGIN + 20, { lineBreak: false });
      doc.rect(MARGIN, HEADER_BOTTOM - 26, usable, ROW_HEIGHT + 2).fill(NAVY);
      let x = MARGIN;
      doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(8);
      report.columns.forEach((column, index) => {
        doc.text(column.header, x + 3, HEADER_BOTTOM - 20, { width: widths[index] - 6, height: 11, ellipsis: true, lineBreak: false, align: column.kind ? "right" : "left" });
        x += widths[index];
      });
    }

    drawHeader();
    let y = HEADER_BOTTOM;
    doc.font("Helvetica").fontSize(8);

    if (report.rows.length === 0) {
      doc.fillColor(MUTED).fontSize(10).text("Nothing to report.", MARGIN, y + 6);
    }

    for (const row of report.rows) {
      if (y + ROW_HEIGHT > doc.page.height - MARGIN - 14) {
        doc.addPage();
        drawHeader();
        y = HEADER_BOTTOM;
        doc.font("Helvetica").fontSize(8);
      }
      let x = MARGIN;
      doc.fillColor(NAVY);
      report.columns.forEach((column, index) => {
        doc.text(cellText(column, row[column.key]), x + 3, y + 5, { width: widths[index] - 6, height: 10, ellipsis: true, lineBreak: false, align: column.kind ? "right" : "left" });
        x += widths[index];
      });
      y += ROW_HEIGHT;
      doc.moveTo(MARGIN, y).lineTo(MARGIN + usable, y).lineWidth(0.5).strokeColor(LINE).stroke();
    }

    const pages = doc.bufferedPageRange();
    for (let index = 0; index < pages.count; index += 1) {
      doc.switchToPage(pages.start + index);
      // The footer sits inside the bottom margin. Without this, pdfkit starts a new blank page for it.
      doc.page.margins.bottom = 0;
      doc.fillColor(MUTED).fontSize(8).text(`Page ${index + 1} of ${pages.count}`, MARGIN, doc.page.height - MARGIN + 8, { width: usable, align: "right", lineBreak: false });
    }
    doc.end();
  });
}
