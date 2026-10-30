import path from "node:path";
import { pathToFileURL } from "node:url";
import { createWorker } from "tesseract.js";

const OCR_TIMEOUT_MS = 90_000;
const PDF_RENDER_SCALE = 2.5;
/** A PDF with less text than this is treated as a scan and read with OCR instead. */
const MIN_PDF_TEXT_LENGTH = 40;

export type OcrText = { text: string; confidence: number };

async function readImage(image: Buffer): Promise<OcrText> {
  const worker = await createWorker("eng", 1, {
    // Language data ships with the app, so OCR works without internet access.
    langPath: path.join(process.cwd(), "node_modules", "@tesseract.js-data", "eng", "4.0.0"),
    cachePath: path.join(process.cwd(), ".next", "cache", "tesseract"),
    gzip: true,
  });
  try {
    const { data } = await worker.recognize(image);
    return { text: data.text, confidence: data.confidence / 100 };
  } finally {
    await worker.terminate();
  }
}

async function readPdf(pdf: Buffer): Promise<OcrText> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
    path.join(process.cwd(), "node_modules", "pdfjs-dist", "legacy", "build", "pdf.worker.mjs"),
  ).href;
  const root = path.join(process.cwd(), "node_modules", "pdfjs-dist");
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(pdf),
    // pdf.js insists on forward slashes here, even on Windows.
    standardFontDataUrl: `${path.join(root, "standard_fonts").replaceAll("\\", "/")}/`,
  });
  try {
    const document = await loadingTask.promise;
    // Only the first page: that's where a deposit receipt's details are.
    const page = await document.getPage(1);
    const content = await page.getTextContent();
    const lines: string[] = [];
    for (const item of content.items) {
      if ("str" in item) {
        lines.push(item.str);
        if (item.hasEOL) lines.push("\n");
      }
    }
    const text = lines.join("");
    if (text.trim().length >= MIN_PDF_TEXT_LENGTH) return { text, confidence: 1 };

    // A scanned PDF has no text layer, so draw the page and read the picture.
    const { createCanvas } = await import("@napi-rs/canvas");
    const viewport = page.getViewport({ scale: PDF_RENDER_SCALE });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await page.render({
      canvas: canvas as unknown as HTMLCanvasElement,
      canvasContext: canvas.getContext("2d") as unknown as CanvasRenderingContext2D,
      viewport,
    }).promise;
    return readImage(canvas.toBuffer("image/png"));
  } finally {
    await loadingTask.destroy();
  }
}

/** Reads text from an FDR image or PDF. Throws if it can't, so the caller can record a failed run. */
export async function extractText(file: Buffer, mimeType: string): Promise<OcrText> {
  const work = mimeType === "application/pdf" ? readPdf(file) : readImage(file);
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("OCR timed out")), OCR_TIMEOUT_MS);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
