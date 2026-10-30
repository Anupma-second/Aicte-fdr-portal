// The six scenarios from the problem brief, each run from start to finish through the real app.
// Needs `npm run dev` and fresh seed data. Reseed afterwards, because it moves time forward for the alert job.
// Usage: npx tsx --env-file=.env tests/scenarios-check.ts
import { createCanvas } from "@napi-rs/canvas";
import { PrismaClient } from "@prisma/client";
import { runAlertJob } from "../src/lib/alerts/job";
import { verifyAuditChain } from "../src/lib/audit/chain";
import { MockBankVerificationService } from "../src/lib/bank";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const DAY = 86_400_000;
const db = new PrismaClient();
const mock = new MockBankVerificationService();
let failures = 0;

function scenario(title: string) {
  console.log(`\n=== ${title}`);
}

function check(name: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  (got ${actual}, expected ${expected})`}`);
}

async function login(email: string) {
  const response = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ email, password: "Demo@12345" }),
  });
  return response.headers.getSetCookie().find((value) => value.startsWith("aicte_session="))!.split(";")[0];
}

function receipt(number: string, amount: string, issued: string, matures: string) {
  const canvas = createCanvas(1400, 800);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 1400, 800);
  ctx.fillStyle = "#000";
  ctx.font = "44px sans-serif";
  ["CANARA BANK", `FDR No: ${number}`, "Branch: Pune Station Road", "IFSC: CNRB0123456", `Deposit Amount: Rs. ${amount}`, `Date of Issue: ${issued}`, `Maturity Date: ${matures}`]
    .forEach((line, index) => ctx.fillText(line, 60, 90 + index * 90));
  return canvas.toBuffer("image/png");
}

const png = (data: Buffer, name = "scan.png") => new File([new Uint8Array(data)], name, { type: "image/png" });
const iso = (days: number) => new Date(Date.now() + days * DAY).toISOString().slice(0, 10);
const dmy = (value: string) => value.split("-").reverse().join("/");
const statusOf = async (id: string) => (await db.fdr.findUniqueOrThrow({ where: { id } })).status;
const trustOf = async (id: string) => (await db.fdr.findUniqueOrThrow({ where: { id } })).trustLevel;

async function goodNumber(prefix: string) {
  for (let index = 0; ; index += 1) {
    const candidate = `${prefix}${String(Date.now()).slice(-6)}${index}`;
    if ((await mock.verify({ fdrNumber: candidate, bankName: "x", amount: "1", maturityDate: new Date() })).result === "CONFIRMED") return candidate;
  }
}

async function main() {
  const institution = await login("institution@demo.test");
  const officer = await login("officer@demo.test");
  const authority = await login("authority@demo.test");
  const send = (cookie: string, path: string, init: RequestInit = {}) =>
    fetch(BASE + path, { ...init, redirect: "manual", headers: { Origin: BASE, Cookie: cookie, ...(init.headers ?? {}) } });
  const json = (cookie: string, path: string, body: object) =>
    send(cookie, path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const act = (id: string, body: object) => json(officer, `/api/fdrs/${id}/actions`, body);

  async function submit(fdrNumber: string, days: number, amount = "500000", scan = true) {
    const issued = iso(-30);
    const matures = iso(days);
    const body = new FormData();
    body.set("data", JSON.stringify({ fdrNumber, bankName: "Canara Bank", branchName: "Pune Station Road", ifscCode: "CNRB0123456", amount, issueDate: issued, maturityDate: matures }));
    if (scan) body.set("scan", png(receipt(fdrNumber, "5,00,000", dmy(issued), dmy(matures))));
    const response = await send(institution, "/api/fdrs", { method: "POST", body });
    const result = await response.json();
    if (response.status !== 201) throw new Error(`submit failed: ${JSON.stringify(result)}`);
    return result as { id: string; referenceNo: string };
  }

  async function activate(id: string) {
    for (const action of ["START", "VERIFY_DOCUMENTS", "BANK_VERIFY", "APPROVE", "ACTIVATE"]) {
      const response = await act(id, { action });
      if (response.status !== 200) throw new Error(`${action} failed: ${await response.text()}`);
    }
  }

  // ---------------------------------------------------------------
  scenario("1. New FDR submission");
  const number1 = await goodNumber("NEW");
  const scanForm = new FormData();
  scanForm.set("file", png(receipt(number1, "5,00,000", dmy(iso(-30)), dmy(iso(800)))));
  const read = await (await send(institution, "/api/ocr", { method: "POST", body: scanForm })).json();
  check("the scan pre-fills the FDR number", read.fields?.fdrNumber, number1);
  check("the scan pre-fills the amount", read.fields?.amount, "500000");
  check("the scan pre-fills the bank", read.fields?.bankName, "Canara Bank");
  const first = await submit(number1, 800);
  check("the FDR is submitted", await statusOf(first.id), "SUBMITTED");
  check("it starts as self-declared", await trustOf(first.id), "SELF_DECLARED");
  check("a clean scan raises nothing", await db.discrepancy.count({ where: { fdrId: first.id } }), 0);
  const officerDashboard = await (await send(officer, "/officer")).text();
  check("the officer's dashboard loads with it waiting", officerDashboard.includes("Needs action today"), true);
  await activate(first.id);
  check("after scrutiny it is active", await statusOf(first.id), "ACTIVE");
  check("and bank-confirmed (simulated)", await trustOf(first.id), "BANK_CONFIRMED");
  const events = (await db.fdrEvent.findMany({ where: { fdrId: first.id } })).map((event) => event.type);
  for (const type of ["SUBMITTED", "DOCUMENT_UPLOADED", "OCR_RUN", "BANK_VERIFICATION", "VERIFIED"]) {
    check(`the timeline records ${type}`, events.includes(type as never), true);
  }

  // ---------------------------------------------------------------
  scenario("2. Validity tracking");
  const track = async (reference: string) => (await (await send("", "/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ referenceNo: reference }) })).json());
  const tracked = await track(first.referenceNo);
  check("public tracking says Valid", tracked.validity, "VALID");
  check("public tracking shows the trust level", tracked.trustLevel, "BANK_CONFIRMED");
  check("public tracking hides the amount", "amount" in tracked, false);
  await db.fdr.update({ where: { id: first.id }, data: { maturityDate: new Date(iso(40)) } });
  check("40 days out, validity becomes Expiring by itself", (await track(first.referenceNo)).validity, "EXPIRING");
  await db.fdr.update({ where: { id: first.id }, data: { maturityDate: new Date(iso(-2)) } });
  check("past the date, validity becomes Matured by itself", (await track(first.referenceNo)).validity, "MATURED");
  await db.fdr.update({ where: { id: first.id }, data: { maturityDate: new Date(iso(800)) } });
  const list = await (await send(institution, `/fdrs?q=${first.referenceNo}`)).text();
  check("the FDR list finds it", list.includes(first.referenceNo), true);
  check("the detail page loads", (await send(institution, `/fdrs/${first.id}`)).status, 200);

  // ---------------------------------------------------------------
  scenario("3. Approaching maturity");
  const approaching = await submit(await goodNumber("MAT"), 100);
  await activate(approaching.id);
  check("100 days out it stays Active", await statusOf(approaching.id), "ACTIVE");
  const at = (daysAhead: number) => new Date(Date.now() + daysAhead * DAY);
  const tiers = async () => (await db.fdrEvent.findMany({ where: { fdrId: approaching.id, type: "ALERT_SENT" }, orderBy: { occurredAt: "asc" } })).map((event) => event.detail).join();
  await runAlertJob(at(5));
  check("at 95 days no reminder has gone", await tiers(), "");
  await runAlertJob(at(12));
  check("at 88 days the 90-day reminder goes", await tiers(), "90");
  check("and the status becomes Expiring", await statusOf(approaching.id), "EXPIRING");
  await runAlertJob(at(13));
  check("the next day it isn't sent again", await tiers(), "90");
  await runAlertJob(at(45));
  check("at 55 days the 60-day reminder goes", await tiers(), "90,60");
  await runAlertJob(at(75));
  check("at 25 days the 30-day reminder goes", await tiers(), "90,60,30");
  const amber = await db.fdr.findUniqueOrThrow({ where: { id: approaching.id } });
  check("risk has risen to amber", amber.riskLevel, "AMBER");
  await runAlertJob(at(95));
  check("at 5 days the final reminder goes", await tiers(), "90,60,30,7");
  check("risk is now red", (await db.fdr.findUniqueOrThrow({ where: { id: approaching.id } })).riskLevel, "RED");
  await runAlertJob(at(102));
  check("past maturity it becomes Matured", await statusOf(approaching.id), "MATURED");
  const ladder = async () => (await db.escalationLog.findMany({ where: { fdrId: approaching.id }, orderBy: { createdAt: "asc" } })).map((row) => row.toLevel).join();
  check("the institution is told first", await ladder(), "INSTITUTION");
  await runAlertJob(at(108));
  check("then the officer", await ladder(), "INSTITUTION,SCRUTINY_OFFICER");
  await runAlertJob(at(116));
  check("then the competent authority", await ladder(), "INSTITUTION,SCRUTINY_OFFICER,COMPETENT_AUTHORITY");
  const authorityUser = await db.user.findUniqueOrThrow({ where: { email: "authority@demo.test" } });
  check("the authority has a notification", await db.notification.count({ where: { userId: authorityUser.id, fdrId: approaching.id } }), 1);

  // ---------------------------------------------------------------
  scenario("4. Renewal");
  const successor = await submit(await goodNumber("REN"), 1500);
  await activate(successor.id);
  const renewed = await json(officer, `/api/fdrs/${approaching.id}/actions`, { action: "LINK_SUCCESSOR", type: "RENEWAL", successorReference: successor.referenceNo });
  check("the officer links the renewal", renewed.status, 200);
  check("the old FDR is Renewed", await statusOf(approaching.id), "RENEWED");
  check("the new FDR is still Active", await statusOf(successor.id), "ACTIVE");
  const chainPage = await (await send(institution, `/fdrs/${successor.id}`)).text();
  check("the chain shows the old FDR on the new one's page", chainPage.includes((await db.fdr.findUniqueOrThrow({ where: { id: approaching.id } })).referenceNo), true);
  const reverse = await (await send(institution, `/fdrs/${approaching.id}`)).text();
  check("and the new FDR on the old one's page", reverse.includes(successor.referenceNo), true);
  const before = await db.notification.count({ where: { fdrId: approaching.id } });
  await runAlertJob(at(130));
  check("alerts stop for the renewed FDR", await db.notification.count({ where: { fdrId: approaching.id } }), before);
  check("its risk drops to green", (await db.fdr.findUniqueOrThrow({ where: { id: approaching.id } })).riskLevel, "GREEN");

  // ---------------------------------------------------------------
  scenario("5. Discrepancy identification");
  const wrongAmount = await submit(await goodNumber("DIS"), 900, "900000");
  const typesOf = async (id: string, status = "OPEN") => (await db.discrepancy.findMany({ where: { fdrId: id, status: status as never } })).map((item) => item.type).sort().join();
  check("an amount unlike the scan is caught", await typesOf(wrongAmount.id), "AMOUNT_MISMATCH");
  const detail = await (await send(officer, `/fdrs/${wrongAmount.id}`)).text();
  check("the officer sees the declared amount", detail.includes("9,00,000"), true);
  check("beside what the document says", detail.includes("5,00,000"), true);
  const noScan = await submit(await goodNumber("NOS"), 900, "500000", false);
  check("a missing scan is caught", await typesOf(noScan.id), "MISSING_DOCUMENT");
  const demoInstitutionId = (await db.user.findUniqueOrThrow({ where: { email: "institution@demo.test" } })).institutionId!;
  const ownNumbers = (await db.fdr.findMany({ where: { institutionId: demoInstitutionId }, select: { fdrNumber: true } })).map((fdr) => fdr.fdrNumber);
  const other = await db.fdr.findFirstOrThrow({ where: { status: "ACTIVE", institutionId: { not: demoInstitutionId }, fdrNumber: { notIn: ownNumbers } } });
  const duplicate = await submit(other.fdrNumber, 900);
  check("a number held by another institution is caught", (await typesOf(duplicate.id)).includes("DUPLICATE_FDR_NUMBER"), true);
  const backwards = await submit(await goodNumber("BAK"), -40);
  check("maturity before issue is caught", (await typesOf(backwards.id)).includes("MATURITY_BEFORE_ISSUE"), true);
  check("an FDR with open discrepancies can't be approved", (await (async () => { await act(wrongAmount.id, { action: "START" }); await act(wrongAmount.id, { action: "VERIFY_DOCUMENTS" }); return act(wrongAmount.id, { action: "APPROVE" }); })()).status, 409);
  check("the officer sends it back", (await act(wrongAmount.id, { action: "SEND_BACK" })).status, 200);
  check("status is Discrepancy Raised", await statusOf(wrongAmount.id), "DISCREPANCY_RAISED");
  const correction = await send(institution, `/api/fdrs/${wrongAmount.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fdrNumber: (await db.fdr.findUniqueOrThrow({ where: { id: wrongAmount.id } })).fdrNumber, bankName: "Canara Bank", branchName: "Pune Station Road", ifscCode: "CNRB0123456", amount: "500000", issueDate: iso(-30), maturityDate: iso(900) }),
  });
  check("the institution corrects the amount", correction.status, 200);
  check("the discrepancy clears itself", await typesOf(wrongAmount.id), "");
  check("the case returns to scrutiny", await statusOf(wrongAmount.id), "UNDER_SCRUTINY");
  check("now it can be approved", (await act(wrongAmount.id, { action: "APPROVE" })).status, 200);

  // ---------------------------------------------------------------
  scenario("6. Authorized release");
  const releasing = await submit(await goodNumber("REL"), 600);
  await activate(releasing.id);
  const requested = await json(institution, `/api/fdrs/${releasing.id}/release`, { reason: "The approval period is over and conditions are met." });
  check("the institution requests release", requested.status, 201);
  const { id: requestId } = await requested.json();
  const step = async () => (await db.releaseRequest.findUniqueOrThrow({ where: { id: requestId } })).status;
  const release = (cookie: string, action: string, note?: string) => json(cookie, `/api/release/${requestId}`, { action, note });
  check("the authority can't approve before scrutiny", (await release(authority, "APPROVE")).status, 409);
  check("the institution can't approve its own", (await release(institution, "APPROVE")).status, 403);
  await release(officer, "ADVANCE");
  check("it reaches document check", await step(), "DOCUMENT_CHECK");
  check("it can't pass without the application", (await release(officer, "ADVANCE")).status, 409);
  const application = new FormData();
  application.set("type", "RELEASE_APPLICATION");
  application.set("file", png(receipt("APP", "1", "01/01/2025", "01/01/2026"), "application.png"));
  check("the institution uploads the application", (await send(institution, `/api/fdrs/${releasing.id}/documents`, { method: "POST", body: application })).status, 201);
  await release(officer, "ADVANCE");
  check("it reaches scrutiny", await step(), "SCRUTINY");
  await release(officer, "ADVANCE");
  check("it reaches the authority", await step(), "AUTHORITY_APPROVAL");
  check("the officer can't approve", (await release(officer, "APPROVE")).status, 409);
  check("the FDR isn't released yet", await statusOf(releasing.id), "RELEASE_REQUESTED");
  check("the authority approves", (await release(authority, "APPROVE", "All conditions met.")).status, 200);
  check("the FDR is Released", await statusOf(releasing.id), "RELEASED");
  check("the case can be closed", (await release(officer, "CLOSE")).status, 200);
  check("the FDR is Closed", await statusOf(releasing.id), "CLOSED");
  const audit = await db.auditLog.findMany({ where: { entityId: requestId, action: "RELEASE_STEP" } });
  check("each release step is in the audit trail", audit.length, 5);

  // ---------------------------------------------------------------
  scenario("Afterwards");
  check("the audit chain survived all of it", (await verifyAuditChain(db)).ok, true);

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} checks FAILED.`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
