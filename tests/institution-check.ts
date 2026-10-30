// End-to-end check of the institution flow against the running app. Needs `npm run dev` and freshly seeded data.
// Usage: npx tsx --env-file=.env tests/institution-check.ts
import { createCanvas } from "@napi-rs/canvas";
import { PrismaClient } from "@prisma/client";
import PDFDocument from "pdfkit";
import { verifyAuditChain } from "../src/lib/audit/chain";

const BASE = "http://localhost:3000";
const db = new PrismaClient();
let failures = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  (got ${actual}, expected ${expected})`}`);
}

function receiptPng(number: string, amount: string, bank = "CANARA BANK"): Buffer {
  const canvas = createCanvas(1400, 800);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 1400, 800);
  ctx.fillStyle = "#000";
  ctx.font = "44px sans-serif";
  [bank, `FDR No: ${number}`, "Branch: Pune Station Road", "IFSC: CNRB0123456", `Deposit Amount: Rs. ${amount}`, "Date of Issue: 12/01/2025", "Maturity Date: 12/01/2030"]
    .forEach((line, index) => ctx.fillText(line, 60, 90 + index * 90));
  return canvas.toBuffer("image/png");
}

function scannedPdf(image: Buffer): Promise<Buffer> {
  return new Promise((resolve) => {
    const pdf = new PDFDocument({ size: "A4" });
    const chunks: Buffer[] = [];
    pdf.on("data", (chunk: Buffer) => chunks.push(chunk));
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.image(image, 30, 30, { width: 530 });
    pdf.end();
  });
}

async function login(email: string): Promise<string> {
  const response = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ email, password: "Demo@12345" }),
  });
  return response.headers.getSetCookie().find((value) => value.startsWith("aicte_session="))!.split(";")[0];
}

function send(path: string, cookie: string, init: RequestInit = {}) {
  return fetch(BASE + path, { ...init, redirect: "manual", headers: { Origin: BASE, Cookie: cookie, ...(init.headers ?? {}) } });
}

function form(fields: Record<string, string>, files: Record<string, { data: Buffer; name: string; type: string }> = {}) {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) body.set(key, value);
  for (const [key, file] of Object.entries(files)) body.set(key, new File([new Uint8Array(file.data)], file.name, { type: file.type }));
  return body;
}

const details = (fdrNumber: string, extra: object = {}) => ({
  fdrNumber,
  bankName: "Canara Bank",
  branchName: "Pune Station Road",
  ifscCode: "CNRB0123456",
  amount: "500000",
  issueDate: "2025-01-12",
  maturityDate: "2030-01-12",
  ...extra,
});

async function main() {
  const institution = await login("institution@demo.test");
  const officer = await login("officer@demo.test");
  const stamp = String(Date.now()).slice(-8);
  const number = `CHK${stamp}`;

  // OCR auto-fill
  const png = receiptPng(number, "5,00,000");
  const ocr = await send("/api/ocr", institution, { method: "POST", body: form({}, { file: { data: png, name: "scan.png", type: "image/png" } }) });
  const read = await ocr.json();
  check("OCR reads the image", read.status, "COMPLETED");
  check("OCR finds the FDR number", read.fields?.fdrNumber, number);
  check("OCR finds the amount", read.fields?.amount, "500000");
  check("OCR finds the bank", read.fields?.bankName, "Canara Bank");
  check("OCR finds the maturity date", read.fields?.maturityDate, "2030-01-12");
  const scanPdf = await scannedPdf(png);
  const ocrPdf = await (await send("/api/ocr", institution, { method: "POST", body: form({}, { file: { data: scanPdf, name: "scan.pdf", type: "application/pdf" } }) })).json();
  check("OCR reads a scanned PDF", ocrPdf.fields?.fdrNumber, number);
  check("officer can't call the OCR route", (await send("/api/ocr", officer, { method: "POST", body: form({}, { file: { data: png, name: "s.png", type: "image/png" } }) })).status, 403);

  // Upload safety
  const badFile = { data: Buffer.from("<script>alert(1)</script>"), name: "evil.pdf", type: "application/pdf" };
  check("a fake PDF is rejected", (await send("/api/ocr", institution, { method: "POST", body: form({}, { file: badFile }) })).status, 415);
  const big = { data: Buffer.concat([Buffer.from("%PDF-"), Buffer.alloc(11 * 1024 * 1024)]), name: "big.pdf", type: "application/pdf" };
  check("an oversized file is rejected", (await send("/api/ocr", institution, { method: "POST", body: form({}, { file: big }) })).status, 413);

  // Clean submission
  const created = await send("/api/fdrs", institution, {
    method: "POST",
    body: form({ data: JSON.stringify(details(number)), ocrToken: read.token }, { scan: { data: png, name: "../../scan.png", type: "image/png" } }),
  });
  const { id, referenceNo } = await created.json();
  check("FDR is created", created.status, 201);
  const fdr = await db.fdr.findUniqueOrThrow({ where: { id }, include: { documents: { include: { ocr: true } }, discrepancies: true, events: true } });
  check("new FDR is Submitted", fdr.status, "SUBMITTED");
  check("new FDR is self-declared", fdr.trustLevel, "SELF_DECLARED");
  check("a matching scan raises no discrepancy", fdr.discrepancies.length, 0);
  check("the OCR result is stored separately", fdr.documents[0].ocr?.fdrNumber, number);
  check("the file name is sanitised", fdr.documents[0].originalName, "scan.png");
  check("reference format", /^FDR-\d{4}-\d{6}$/.test(referenceNo), true);
  check("timeline records submit, upload and OCR", ["SUBMITTED", "DOCUMENT_UPLOADED", "OCR_RUN"].every((type) => fdr.events.some((event) => event.type === type)), true);
  check("submitting the same number again is refused", (await send("/api/fdrs", institution, { method: "POST", body: form({ data: JSON.stringify(details(number)) }) })).status, 409);

  // A forged OCR token must not be believed
  const forged = await send("/api/fdrs", institution, {
    method: "POST",
    body: form({ data: JSON.stringify(details(`F${stamp}`)), ocrToken: "forged.token.here" }, { scan: { data: png, name: "scan.png", type: "image/png" } }),
  });
  const forgedFdr = await db.fdr.findUniqueOrThrow({ where: { id: (await forged.json()).id }, include: { documents: { include: { ocr: true } } } });
  check("a forged token is ignored, and the file is read again", forgedFdr.documents[0].ocr?.fdrNumber, number);

  // Discrepancy engine
  const wrong = await send("/api/fdrs", institution, {
    method: "POST",
    body: form({ data: JSON.stringify(details(`W${stamp}`, { amount: "900000", bankName: "HDFC Bank", maturityDate: "2020-01-01" })), ocrToken: read.token }, { scan: { data: png, name: "s.png", type: "image/png" } }),
  });
  const wrongId = (await wrong.json()).id;
  const wrongTypes = (await db.discrepancy.findMany({ where: { fdrId: wrongId } })).map((item) => item.type).sort().join();
  check("mismatches are flagged", wrongTypes, "AMOUNT_MISMATCH,BANK_MISMATCH,MATURITY_BEFORE_ISSUE");
  const wrongRisk = await db.fdr.findUniqueOrThrow({ where: { id: wrongId } });
  check("open discrepancies raise the risk score", wrongRisk.riskScore > 0, true);

  const edit = await send(`/api/fdrs/${wrongId}`, institution, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(details(`W${stamp}`)) });
  check("details can be corrected", edit.status, 200);
  const stillOpen = await db.discrepancy.count({ where: { fdrId: wrongId, status: "OPEN" } });
  check("correcting the details resolves the discrepancies", stillOpen, 0);

  const noScan = await send("/api/fdrs", institution, { method: "POST", body: form({ data: JSON.stringify(details(`N${stamp}`, { ifscCode: "" })) }) });
  const noScanId = (await noScan.json()).id;
  const noScanTypes = (await db.discrepancy.findMany({ where: { fdrId: noScanId, status: "OPEN" } })).map((item) => item.type).sort().join();
  check("a missing scan and IFSC are flagged", noScanTypes, "MISSING_DOCUMENT,MISSING_FIELD");

  const seededDuplicate = await db.fdr.findFirstOrThrow({ where: { status: "ACTIVE", institutionId: { not: fdr.institutionId } } });
  const dup = await send("/api/fdrs", institution, { method: "POST", body: form({ data: JSON.stringify(details(seededDuplicate.fdrNumber)) }) });
  const dupItems = await db.discrepancy.findMany({ where: { fdrId: (await dup.json()).id } });
  check("a number held by another institution is flagged", dupItems.some((item) => item.type === "DUPLICATE_FDR_NUMBER"), true);

  // Versioning
  const uploadV2 = await send(`/api/fdrs/${noScanId}/documents`, institution, { method: "POST", body: form({ type: "FDR_SCAN" }, { file: { data: png, name: "v1.png", type: "image/png" } }) });
  check("a document can be added", uploadV2.status, 201);
  const uploadV3 = await send(`/api/fdrs/${noScanId}/documents`, institution, { method: "POST", body: form({ type: "FDR_SCAN" }, { file: { data: png, name: "v2.png", type: "image/png" } }) });
  check("a second upload becomes version 2", (await uploadV3.json()).version, 2);
  const docs = await db.fdrDocument.findMany({ where: { fdrId: noScanId, type: "FDR_SCAN" } });
  check("only the newest version is current", docs.filter((doc) => doc.isCurrent).length, 1);
  check("the old version is kept", docs.length, 2);
  const missingNow = await db.discrepancy.findFirst({ where: { fdrId: noScanId, type: "MISSING_DOCUMENT" } });
  check("uploading the scan resolves the missing document flag", missingNow?.status, "RESOLVED");

  // Encryption and document access
  const docId = fdr.documents[0].id;
  const fetched = await send(`/api/documents/${docId}`, institution);
  const bytes = Buffer.from(await fetched.arrayBuffer());
  check("the owner gets the original file back", bytes.equals(png), true);
  check("the officer can open it", (await send(`/api/documents/${docId}`, officer)).status, 200);
  const other = await db.fdr.findFirstOrThrow({ where: { institutionId: { not: fdr.institutionId }, documents: { some: {} } }, include: { documents: true } });
  check("another institution's document is hidden", (await send(`/api/documents/${other.documents[0].id}`, institution)).status, 404);

  // Scoping
  // The page streams, so a hidden FDR can return 200. What matters is that none of its details are sent.
  const hiddenPage = await (await send(`/fdrs/${other.id}`, institution)).text();
  check("another institution's FDR page shows no reference", hiddenPage.includes(other.referenceNo), false);
  check("another institution's FDR page shows no FDR number", hiddenPage.includes(other.fdrNumber), false);
  check("the officer can open any FDR page", (await send(`/fdrs/${other.id}`, officer)).status, 200);
  check("can't edit another institution's FDR", (await send(`/api/fdrs/${other.id}`, institution, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(details("HACK1234")) })).status, 404);
  check("can't upload to another institution's FDR", (await send(`/api/fdrs/${other.id}/documents`, institution, { method: "POST", body: form({ type: "OTHER" }, { file: { data: png, name: "x.png", type: "image/png" } }) })).status, 404);
  check("an officer can't submit an FDR", (await send("/api/fdrs", officer, { method: "POST", body: form({ data: JSON.stringify(details(`O${stamp}`)) }) })).status, 403);
  check("an officer can't open the new FDR page", (await send("/fdrs/new", officer)).headers.get("location")?.endsWith("/forbidden"), true);
  check("anonymous document access is refused", (await fetch(`${BASE}/api/documents/${docId}`, { redirect: "manual" })).status, 401);
  const list = await (await send(`/fdrs?q=${seededDuplicate.referenceNo}`, institution)).text();
  check("the list doesn't show another institution's FDR", list.includes(seededDuplicate.referenceNo + "</a>"), false);

  // Status rules
  const verifiedFdr = await db.fdr.findFirstOrThrow({ where: { institutionId: fdr.institutionId, status: "ACTIVE" } });
  check("an active FDR can't be edited", (await send(`/api/fdrs/${verifiedFdr.id}`, institution, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(details(verifiedFdr.fdrNumber)) })).status, 409);
  check("an active FDR's scan can't be replaced", (await send(`/api/fdrs/${verifiedFdr.id}/documents`, institution, { method: "POST", body: form({ type: "FDR_SCAN" }, { file: { data: png, name: "x.png", type: "image/png" } }) })).status, 409);

  // Responding to a discrepancy sends the case back
  const raised = await db.fdr.findFirstOrThrow({ where: { institutionId: fdr.institutionId, status: "DISCREPANCY_RAISED" }, include: { discrepancies: { where: { status: "OPEN" } } } });
  const respond = (text: string, target = raised.discrepancies[0].id) =>
    send(`/api/fdrs/${raised.id}/discrepancies/${target}`, institution, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ response: text }) });
  check("an empty response is rejected", (await respond("x")).status, 400);
  check("a response is accepted", (await respond("The bank has reissued this receipt.")).status, 200);
  check("answering twice is refused", (await respond("Second answer here.")).status, 409);
  check("the case returns to scrutiny", (await db.fdr.findUniqueOrThrow({ where: { id: raised.id } })).status, "UNDER_SCRUTINY");

  // Pages render
  for (const path of ["/institution", "/fdrs", "/fdrs/new", `/fdrs/${id}`, `/fdrs/${wrongId}/edit`, "/fdrs?status=ACTIVE&sort=amount&dir=desc", "/fdrs?page=abc&sort=hack"]) {
    check(`${path} loads`, (await send(path, institution)).status, 200);
  }

  const chain = await verifyAuditChain(db);
  check("the audit chain is intact after all of this", chain.ok, true);

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} checks FAILED.`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
