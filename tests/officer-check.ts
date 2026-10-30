// End-to-end check of the scrutiny officer flow against the running app. Needs `npm run dev` and fresh seed data.
// Usage: npx tsx --env-file=.env tests/officer-check.ts
import { PrismaClient } from "@prisma/client";
import { verifyAuditChain } from "../src/lib/audit/chain";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const db = new PrismaClient();
let failures = 0;

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

const PDF = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF");

function details(fdrNumber: string, maturityDate = "2031-01-12") {
  return { fdrNumber, bankName: "Axis Bank", branchName: "Pune Main", ifscCode: "UTIB0001234", amount: "500000", issueDate: "2025-01-12", maturityDate };
}

async function submit(cookie: string, fdrNumber: string, maturityDate?: string, withScan = true): Promise<string> {
  const body = new FormData();
  body.set("data", JSON.stringify(details(fdrNumber, maturityDate)));
  if (withScan) body.set("scan", new File([new Uint8Array(PDF)], "scan.pdf", { type: "application/pdf" }));
  const response = await fetch(`${BASE}/api/fdrs`, { method: "POST", headers: { Origin: BASE, Cookie: cookie }, body });
  const result = await response.json();
  if (response.status !== 201) throw new Error(`submit failed: ${JSON.stringify(result)}`);
  return result.id;
}

function act(cookie: string, fdrId: string, body: object) {
  return fetch(`${BASE}/api/fdrs/${fdrId}/actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE, Cookie: cookie },
    body: JSON.stringify(body),
  });
}

const statusOf = async (id: string) => (await db.fdr.findUniqueOrThrow({ where: { id } })).status;
const trustOf = async (id: string) => (await db.fdr.findUniqueOrThrow({ where: { id } })).trustLevel;

async function main() {
  const officer = await login("officer@demo.test");
  const institution = await login("institution@demo.test");
  const authority = await login("authority@demo.test");
  const admin = await login("admin@demo.test");
  const stamp = String(Date.now()).slice(-7);

  // A number the mock bank confirms: try until the mock's rule gives CONFIRMED (checked below).
  const { MockBankVerificationService } = await import("../src/lib/bank");
  const mock = new MockBankVerificationService();
  let good = "";
  for (let index = 0; !good; index += 1) {
    const candidate = `OK${stamp}${index}`;
    const answer = await mock.verify({ fdrNumber: candidate, bankName: "x", amount: "1", maturityDate: new Date() });
    if (answer.result === "CONFIRMED") good = candidate;
  }

  // Happy path
  const id = await submit(institution, good);
  const body = { action: "START" };
  check("an institution can't act as an officer", (await act(institution, id, body)).status, 403);
  check("an authority can't act as an officer", (await act(authority, id, body)).status, 403);
  check("an admin can't act as an officer", (await act(admin, id, body)).status, 403);
  check("can't approve before starting", (await act(officer, id, { action: "APPROVE" })).status, 409);
  check("officer starts scrutiny", (await act(officer, id, body)).status, 200);
  check("status is Under Scrutiny", await statusOf(id), "UNDER_SCRUTINY");
  check("the case is assigned to the officer", Boolean((await db.fdr.findUniqueOrThrow({ where: { id } })).assignedOfficerId), true);
  check("can't start twice", (await act(officer, id, body)).status, 409);
  check("can't approve a self-declared FDR", (await act(officer, id, { action: "APPROVE" })).status, 409);

  check("an observation is too short", (await act(officer, id, { action: "OBSERVE", note: "x" })).status, 400);
  check("an observation is saved", (await act(officer, id, { action: "OBSERVE", note: "Receipt looks genuine." })).status, 200);
  const institutionView = await (await fetch(`${BASE}/fdrs/${id}`, { headers: { Cookie: institution } })).text();
  check("the institution can't see officer notes", institutionView.includes("Receipt looks genuine."), false);
  const officerView = await (await fetch(`${BASE}/fdrs/${id}`, { headers: { Cookie: officer } })).text();
  check("the officer can see the note", officerView.includes("Receipt looks genuine."), true);

  check("documents are verified", (await act(officer, id, { action: "VERIFY_DOCUMENTS" })).status, 200);
  check("the badge rises to document-verified", await trustOf(id), "DOCUMENT_VERIFIED");

  const bank = await act(officer, id, { action: "BANK_VERIFY" });
  check("the bank confirms", (await bank.json()).result, "CONFIRMED");
  check("the badge rises to bank-confirmed", await trustOf(id), "BANK_CONFIRMED");
  const log = await db.bankVerificationLog.findFirstOrThrow({ where: { fdrId: id } });
  check("the bank's answer is logged as simulated", (log.responsePayload as { simulated: boolean }).simulated, true);
  check("the adapter is recorded", log.adapter, "mock");

  check("approval works", (await act(officer, id, { action: "APPROVE" })).status, 200);
  check("status is Verified", await statusOf(id), "VERIFIED");
  check("the SLA timer stops", (await db.fdr.findUniqueOrThrow({ where: { id } })).slaDueAt, null);
  check("activation works", (await act(officer, id, { action: "ACTIVATE" })).status, 200);
  check("status is Active", await statusOf(id), "ACTIVE");

  // Activation close to maturity goes straight to Expiring
  const soon = new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 10);
  let goodSoon = "";
  for (let index = 0; !goodSoon; index += 1) {
    const candidate = `SO${stamp}${index}`;
    if ((await mock.verify({ fdrNumber: candidate, bankName: "x", amount: "1", maturityDate: new Date() })).result === "CONFIRMED") goodSoon = candidate;
  }
  const soonId = await submit(institution, goodSoon, soon);
  for (const action of ["START", "BANK_VERIFY", "APPROVE", "ACTIVATE"]) await act(officer, soonId, { action });
  check("an FDR near maturity becomes Expiring", await statusOf(soonId), "EXPIRING");

  // Bank says no
  const notFound = await submit(institution, `NF${stamp}`);
  await act(officer, notFound, { action: "START" });
  check("the bank reports not found", (await (await act(officer, notFound, { action: "BANK_VERIFY" })).json()).result, "NOT_FOUND");
  check("that raises a discrepancy", await statusOf(notFound), "DISCREPANCY_RAISED");
  check("the badge doesn't rise", await trustOf(notFound), "SELF_DECLARED");

  const mismatch = await submit(institution, `MM${stamp}`);
  await act(officer, mismatch, { action: "START" });
  check("the bank reports a mismatch", (await (await act(officer, mismatch, { action: "BANK_VERIFY" })).json()).result, "MISMATCH");
  const declared = await db.fdr.findUniqueOrThrow({ where: { id: mismatch } });
  check("the declared amount is not overwritten", declared.amount.toString(), "500000");
  const mismatchLog = await db.bankVerificationLog.findFirstOrThrow({ where: { fdrId: mismatch } });
  check("the bank's own value is stored separately", mismatchLog.confirmedAmount?.toString(), "475000");

  // Officer-raised discrepancy round trip
  const raised = await submit(institution, `RA${stamp}`);
  await act(officer, raised, { action: "START" });
  check("an officer raises a discrepancy", (await act(officer, raised, { action: "RAISE", severity: "HIGH", message: "The seal on the receipt is unclear." })).status, 200);
  check("status is Discrepancy Raised", await statusOf(raised), "DISCREPANCY_RAISED");
  const item = await db.discrepancy.findFirstOrThrow({ where: { fdrId: raised, source: "OFFICER" } });
  const reply = await fetch(`${BASE}/api/fdrs/${raised}/discrepancies/${item.id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE, Cookie: institution },
    body: JSON.stringify({ response: "A clearer scan has been uploaded." }),
  });
  check("the institution responds", reply.status, 200);
  check("the case returns to scrutiny", await statusOf(raised), "UNDER_SCRUTINY");
  check("can't approve with a response still unreviewed", (await act(officer, raised, { action: "APPROVE" })).status, 409);
  check("the officer resolves it", (await act(officer, raised, { action: "CLOSE_DISCREPANCY", discrepancyId: item.id, note: "Clearer scan checked." })).status, 200);
  check("it is marked resolved", (await db.discrepancy.findUniqueOrThrow({ where: { id: item.id } })).status, "RESOLVED");
  check("can't close it twice", (await act(officer, raised, { action: "CLOSE_DISCREPANCY", discrepancyId: item.id, note: "Again please." })).status, 409);

  // A waived system finding stays waived, and doesn't come back
  const body2 = new FormData();
  body2.set("data", JSON.stringify({ ...details(`WV${stamp}`), ifscCode: "" }));
  const noIfsc = (await (await fetch(`${BASE}/api/fdrs`, { method: "POST", headers: { Origin: BASE, Cookie: institution }, body: body2 })).json()).id;
  await act(officer, noIfsc, { action: "START" });
  const finding = await db.discrepancy.findFirstOrThrow({ where: { fdrId: noIfsc, type: "MISSING_FIELD" } });
  await act(officer, noIfsc, { action: "CLOSE_DISCREPANCY", discrepancyId: finding.id, note: "IFSC not on this old receipt." });
  check("an automatic finding is waived, not marked fixed", (await db.discrepancy.findUniqueOrThrow({ where: { id: finding.id } })).status, "WAIVED");
  await act(officer, noIfsc, { action: "OBSERVE", note: "Still reviewing this one." });
  await act(officer, noIfsc, { action: "VERIFY_DOCUMENTS" });
  const open = await db.discrepancy.count({ where: { fdrId: noIfsc, type: "MISSING_FIELD", status: "OPEN" } });
  check("the waived finding doesn't come back", open, 0);
  check("another FDR's discrepancy can't be closed from here", (await act(officer, noIfsc, { action: "CLOSE_DISCREPANCY", discrepancyId: item.id, note: "Wrong FDR here." })).status, 404);

  // Renewal chain
  const successor = await submit(institution, `RN${stamp}`, "2035-01-01");
  const successorRef = (await db.fdr.findUniqueOrThrow({ where: { id: successor } })).referenceNo;
  const link = (fdrId: string, reference: string, type = "RENEWAL") => act(officer, fdrId, { action: "LINK_SUCCESSOR", type, successorReference: reference });
  check("can't renew an FDR that isn't live", (await link(successor, successorRef)).status, 409);
  const oldRef = (await db.fdr.findUniqueOrThrow({ where: { id } })).referenceNo;
  check("can't link an FDR to itself", (await link(id, oldRef)).status, 400);
  check("an unknown reference is refused", (await link(id, "FDR-2099-999999")).status, 404);
  const otherInstitution = await db.fdr.findFirstOrThrow({ where: { institutionId: { not: (await db.fdr.findUniqueOrThrow({ where: { id } })).institutionId } } });
  check("can't link across institutions", (await link(id, otherInstitution.referenceNo)).status, 404);
  const older = await submit(institution, `OL${stamp}`, "2026-12-30");
  check("the new FDR must mature later", (await link(id, (await db.fdr.findUniqueOrThrow({ where: { id: older } })).referenceNo)).status, 400);
  check("the renewal is linked", (await link(id, successorRef)).status, 200);
  check("the old FDR is Renewed", await statusOf(id), "RENEWED");
  check("the old FDR carries no risk now", (await db.fdr.findUniqueOrThrow({ where: { id } })).riskLevel, "GREEN");
  const page = await (await fetch(`${BASE}/fdrs/${successor}`, { headers: { Cookie: institution } })).text();
  check("the chain shows on the new FDR's page", page.includes(oldRef), true);
  check("a renewed FDR can be closed", (await act(officer, id, { action: "CLOSE" })).status, 200);
  check("it is Closed", await statusOf(id), "CLOSED");
  check("nothing more can happen to it", (await act(officer, id, { action: "OBSERVE", note: "One more note." })).status, 409);

  // Another officer's case
  const second = await db.user.create({
    data: { email: `officer2${stamp}@example.test`, name: "Second Officer", role: "SCRUTINY_OFFICER", status: "ACTIVE", passwordHash: (await db.user.findUniqueOrThrow({ where: { email: "officer@demo.test" } })).passwordHash },
  });
  const secondCookie = await login(second.email);
  check("a second officer is refused on someone else's case", (await act(secondCookie, raised, { action: "OBSERVE", note: "Not my case at all." })).status, 403);

  // Status can never be set directly
  const forced = await act(officer, successor, { action: "START", status: "CLOSED", trustLevel: "BANK_CONFIRMED" });
  check("extra fields are ignored", forced.status, 200);
  check("status followed the rules, not the request", await statusOf(successor), "UNDER_SCRUTINY");
  check("trust wasn't set by the request", await trustOf(successor), "SELF_DECLARED");

  // Pages and audit
  for (const path of ["/officer", `/fdrs/${raised}`, `/fdrs/${successor}`]) {
    check(`${path} loads`, (await fetch(BASE + path, { headers: { Cookie: officer }, redirect: "manual" })).status, 200);
  }
  check("authority can read an FDR page", (await fetch(`${BASE}/fdrs/${raised}`, { headers: { Cookie: authority } })).status, 200);
  const chain = await verifyAuditChain(db);
  check("the audit chain is intact", chain.ok, true);
  const actions = await db.auditLog.groupBy({ by: ["action"], where: { actorId: { not: null } } });
  for (const action of ["BANK_VERIFICATION", "DOCUMENTS_VERIFIED", "OBSERVATION_ADDED", "RENEWAL_LINKED", "DISCREPANCY_RESOLVED", "DISCREPANCY_WAIVED"]) {
    check(`audit records ${action}`, actions.some((row) => row.action === action), true);
  }

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} checks FAILED.`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
