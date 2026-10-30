// End-to-end check of alerts, release and calendar against the running app. Needs `npm run dev` and fresh seed data.
// Usage: npx tsx --env-file=.env tests/alerts-check.ts
import { PrismaClient } from "@prisma/client";
import { verifyAuditChain } from "../src/lib/audit/chain";
import { runAlertJob } from "../src/lib/alerts/job";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const db = new PrismaClient();
const DAY = 86_400_000;
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

function post(path: string, cookie: string, body?: object) {
  return fetch(BASE + path, {
    method: "POST",
    headers: { Origin: BASE, Cookie: cookie, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const page = (path: string, cookie: string) => fetch(BASE + path, { headers: { Cookie: cookie }, redirect: "manual" });
const statusOf = async (id: string) => (await db.fdr.findUniqueOrThrow({ where: { id } })).status;
const dateIn = (days: number) => new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()) + days * DAY);

async function main() {
  const institution = await login("institution@demo.test");
  const officer = await login("officer@demo.test");
  const authority = await login("authority@demo.test");
  const admin = await login("admin@demo.test");
  const demoUser = await db.user.findUniqueOrThrow({ where: { email: "institution@demo.test" } });
  const officerUser = await db.user.findUniqueOrThrow({ where: { email: "officer@demo.test" } });
  const authorityUser = await db.user.findUniqueOrThrow({ where: { email: "authority@demo.test" } });
  const institutionId = demoUser.institutionId!;

  // Alerts: put FDRs at known distances from maturity
  const active = await db.fdr.findMany({ where: { institutionId: { not: institutionId }, status: "ACTIVE" }, take: 4, orderBy: { referenceNo: "asc" } });
  const [in25, overdue3, overdue10, overdue20] = active;
  for (const [fdr, days] of [[in25, 25], [overdue3, -3], [overdue10, -10], [overdue20, -20]] as const) {
    await db.fdr.update({ where: { id: fdr.id }, data: { maturityDate: dateIn(days), assignedOfficerId: officerUser.id } });
  }

  check("only an admin can run the job", (await post("/api/admin/alerts/run", officer)).status, 403);
  const first = await post("/api/admin/alerts/run", admin);
  const summary = await first.json();
  check("the admin can run the job", first.status, 200);
  check("the job found nothing failing", summary.failed, 0);
  check("the job sent reminders", summary.reminders > 0, true);
  check("the job escalated", summary.escalations > 0, true);

  const repeat = await runAlertJob();
  check("a repeat run sends no reminders", repeat.reminders, 0);
  check("a repeat run escalates nothing", repeat.escalations, 0);
  check("a repeat run sends no emails", repeat.emails, 0);

  check("an FDR 25 days out became Expiring", await statusOf(in25.id), "EXPIRING");
  const reminders = await db.notification.findMany({ where: { fdrId: in25.id, kind: "REMINDER" } });
  check("it got exactly one reminder tier", new Set(reminders.map((item) => item.dedupeKey?.split(":")[1])).size, 1);
  check("the reminder is emailed, and logged because SMTP isn't set", reminders[0]?.emailStatus, "LOGGED");
  check("the reminder is in the timeline", await db.fdrEvent.count({ where: { fdrId: in25.id, type: "ALERT_SENT" } }), 1);

  check("3 days overdue became Matured", await statusOf(overdue3.id), "MATURED");
  const levels = async (id: string) => (await db.escalationLog.findMany({ where: { fdrId: id }, orderBy: { daysOverdue: "asc" } })).map((row) => row.toLevel).sort().join();
  check("3 days overdue reaches the institution only", await levels(overdue3.id), "INSTITUTION");
  check("10 days overdue reaches the officer too", await levels(overdue10.id), "INSTITUTION,SCRUTINY_OFFICER");
  check("20 days overdue reaches the authority too", await levels(overdue20.id), "COMPETENT_AUTHORITY,INSTITUTION,SCRUTINY_OFFICER");
  check("the assigned officer is told", await db.notification.count({ where: { fdrId: overdue10.id, userId: officerUser.id } }) > 0, true);
  check("the officer isn't told at 3 days", await db.notification.count({ where: { fdrId: overdue3.id, userId: officerUser.id } }), 0);
  check("the authority is told at 20 days", await db.notification.count({ where: { fdrId: overdue20.id, userId: authorityUser.id } }) > 0, true);
  check("the authority isn't told at 10 days", await db.notification.count({ where: { fdrId: overdue10.id, userId: authorityUser.id } }), 0);
  check("the escalation ladder records who it came from", (await db.escalationLog.findFirstOrThrow({ where: { fdrId: overdue10.id, toLevel: "SCRUTINY_OFFICER" } })).fromLevel, "INSTITUTION");
  check("escalation raises the risk history", (await db.fdr.findUniqueOrThrow({ where: { id: overdue20.id } })).riskLevel, "RED");
  check("finished FDRs get no alerts", await db.notification.count({ where: { fdr: { status: "CLOSED" }, kind: { in: ["REMINDER", "ESCALATION"] } } }), 0);

  const later = new Date(Date.now() + 8 * DAY);
  const fresh = await runAlertJob(later);
  check("time passing moves an FDR up the ladder", fresh.escalations > 0, true);
  check("the 3-day FDR now reaches the officer", await levels(overdue3.id), "INSTITUTION,SCRUTINY_OFFICER");

  // Admin rules
  const rule = await post("/api/admin/alert-rules", admin, { kind: "REMINDER", days: 45, targetLevel: "INSTITUTION" });
  check("an admin adds a rule", rule.status, 201);
  check("the same rule can't be added twice", (await post("/api/admin/alert-rules", admin, { kind: "REMINDER", days: 45, targetLevel: "INSTITUTION" })).status, 409);
  check("a reminder can't target an officer", (await post("/api/admin/alert-rules", admin, { kind: "REMINDER", days: 46, targetLevel: "SCRUTINY_OFFICER" })).status, 400);
  check("days must be sensible", (await post("/api/admin/alert-rules", admin, { kind: "REMINDER", days: 0, targetLevel: "INSTITUTION" })).status, 400);
  check("a non-admin can't add a rule", (await post("/api/admin/alert-rules", authority, { kind: "REMINDER", days: 47, targetLevel: "INSTITUTION" })).status, 403);
  const { id: ruleId } = await rule.json();
  const off = await fetch(`${BASE}/api/admin/alert-rules/${ruleId}`, { method: "PATCH", headers: { "Content-Type": "application/json", Origin: BASE, Cookie: admin }, body: JSON.stringify({ isActive: false }) });
  check("an admin can switch a rule off", off.status, 200);
  check("the rule is off", (await db.alertRule.findUniqueOrThrow({ where: { id: ruleId } })).isActive, false);

  // Release workflow
  const fdr = await db.fdr.findFirstOrThrow({ where: { institutionId, status: { in: ["ACTIVE", "EXPIRING"] } } });
  const other = await db.fdr.findFirstOrThrow({ where: { institutionId: { not: institutionId }, status: "ACTIVE" } });
  const reason = { reason: "The approval period has ended and conditions are met." };
  check("an officer can't request a release", (await post(`/api/fdrs/${fdr.id}/release`, officer, reason)).status, 403);
  check("can't request for another institution", (await post(`/api/fdrs/${other.id}/release`, institution, reason)).status, 404);
  check("a reason is required", (await post(`/api/fdrs/${fdr.id}/release`, institution, { reason: "short" })).status, 400);
  const requested = await post(`/api/fdrs/${fdr.id}/release`, institution, reason);
  check("the institution requests a release", requested.status, 201);
  const { id: requestId } = await requested.json();
  check("the FDR is Release Requested", await statusOf(fdr.id), "RELEASE_REQUESTED");
  check("can't request twice", (await post(`/api/fdrs/${fdr.id}/release`, institution, reason)).status, 409);
  check("officers are told", await db.notification.count({ where: { fdrId: fdr.id, userId: officerUser.id } }) > 0, true);

  const act = (cookie: string, action: string, note?: string) => post(`/api/release/${requestId}`, cookie, { action, note });
  const stepOf = async () => (await db.releaseRequest.findUniqueOrThrow({ where: { id: requestId } })).status;
  check("an institution can't move it along", (await act(institution, "ADVANCE")).status, 403);
  check("the authority can't approve it yet", (await act(authority, "APPROVE")).status, 409);
  check("an admin can't touch it", (await act(admin, "APPROVE")).status, 403);
  check("the officer starts the document check", (await act(officer, "ADVANCE")).status, 200);
  check("step is Document Check", await stepOf(), "DOCUMENT_CHECK");
  const blocked = await act(officer, "ADVANCE");
  check("it stops without a release application", blocked.status, 409);
  check("and says why", (await blocked.json()).error.code, "RELEASE_BLOCKED_NO_APPLICATION");

  const body = new FormData();
  body.set("type", "RELEASE_APPLICATION");
  body.set("file", new File([new Uint8Array(Buffer.from("%PDF-1.4\n%%EOF"))], "application.pdf", { type: "application/pdf" }));
  const uploaded = await fetch(`${BASE}/api/fdrs/${fdr.id}/documents`, { method: "POST", headers: { Origin: BASE, Cookie: institution }, body });
  check("the institution uploads the application", uploaded.status, 201);
  check("the document check passes", (await act(officer, "ADVANCE")).status, 200);
  check("step is Scrutiny", await stepOf(), "SCRUTINY");

  const blocker = await db.discrepancy.create({ data: { fdrId: fdr.id, type: "OTHER", source: "OFFICER", message: "Check the receipt seal." } });
  const blocked2 = await act(officer, "ADVANCE");
  check("an open discrepancy stops it", (await blocked2.json()).error.code, "RELEASE_BLOCKED_UNRESOLVED");
  await db.discrepancy.update({ where: { id: blocker.id }, data: { status: "RESOLVED" } });
  check("scrutiny passes", (await act(officer, "ADVANCE")).status, 200);
  check("step is Authority Approval", await stepOf(), "AUTHORITY_APPROVAL");
  check("the authority is told", await db.notification.count({ where: { fdrId: fdr.id, userId: authorityUser.id } }) > 0, true);
  check("the officer can't approve", (await act(officer, "APPROVE")).status, 409);
  check("the FDR is still Release Requested", await statusOf(fdr.id), "RELEASE_REQUESTED");
  check("rejecting needs a reason", (await act(authority, "REJECT")).status, 400);
  check("the authority approves", (await act(authority, "APPROVE", "All conditions met.")).status, 200);
  check("the FDR is Released", await statusOf(fdr.id), "RELEASED");
  check("the decision is recorded", (await db.releaseRequest.findUniqueOrThrow({ where: { id: requestId } })).decidedById, authorityUser.id);
  check("can't approve twice", (await act(authority, "APPROVE")).status, 409);
  check("the officer closes it", (await act(officer, "CLOSE")).status, 200);
  check("the FDR is Closed", await statusOf(fdr.id), "CLOSED");
  check("the institution was told", await db.notification.count({ where: { fdrId: fdr.id, userId: demoUser.id, kind: "RELEASE" } }) >= 3, true);

  // Rejection path
  const second = await db.fdr.findFirstOrThrow({ where: { institutionId, status: { in: ["ACTIVE", "EXPIRING"] } } });
  const secondRequest = await (await post(`/api/fdrs/${second.id}/release`, institution, reason)).json();
  await db.releaseRequest.update({ where: { id: secondRequest.id }, data: { status: "AUTHORITY_APPROVAL" } });
  check("the authority rejects with a reason", (await post(`/api/release/${secondRequest.id}`, authority, { action: "REJECT", note: "Conditions are not met yet." })).status, 200);
  check("the FDR returns to its previous status", await statusOf(second.id), second.status);
  check("it can be requested again", (await post(`/api/fdrs/${second.id}/release`, institution, reason)).status, 201);

  // Notifications
  const mine = await db.notification.findFirstOrThrow({ where: { userId: demoUser.id } });
  const someoneElses = await db.notification.findFirstOrThrow({ where: { userId: officerUser.id } });
  check("can't mark someone else's as read", (await post(`/api/notifications/${someoneElses.id}`, institution)).status, 404);
  check("a notification can be marked read", (await post(`/api/notifications/${mine.id}`, institution)).status, 200);
  check("it is read", Boolean((await db.notification.findUniqueOrThrow({ where: { id: mine.id } })).readAt), true);
  const inbox = await (await page("/notifications", institution)).text();
  check("the page shows readable text, not codes", inbox.includes("i18n:") && !/"title":"i18n:/.test(inbox) ? true : !inbox.includes(">i18n:"), true);
  check("mark all works", (await post("/api/notifications", institution)).status, 200);
  check("nothing is unread", await db.notification.count({ where: { userId: demoUser.id, readAt: null } }), 0);
  check("it didn't touch other people's", await db.notification.count({ where: { userId: officerUser.id, readAt: null } }) > 0, true);

  // Calendar
  const target = await db.fdr.findFirstOrThrow({ where: { status: "EXPIRING", institutionId: { not: institutionId } }, orderBy: { maturityDate: "asc" } });
  const month = target.maturityDate.toISOString().slice(0, 7);
  const day = target.maturityDate.getUTCDate();
  const staffDay = await (await page(`/calendar?month=${month}&day=${day}`, officer)).text();
  check("clicking a day lists its FDRs", staffDay.includes(target.referenceNo), true);
  const institutionDay = await (await page(`/calendar?month=${month}&day=${day}`, institution)).text();
  check("an institution doesn't see others on that day", institutionDay.includes(target.referenceNo), false);
  for (const path of ["/calendar", "/calendar?month=abc", "/calendar?month=2026-13&day=99", "/calendar?month=2020-02&day=29"]) {
    check(`${path} loads`, (await page(path, officer)).status, 200);
  }
  check("calendar needs a login", (await fetch(`${BASE}/calendar`, { redirect: "manual" })).status, 307);

  // Pages and audit
  for (const [path, cookie] of [["/notifications", officer], ["/admin", admin], ["/authority", authority], ["/officer", officer], ["/institution", institution], [`/fdrs/${fdr.id}`, institution]] as const) {
    check(`${path} loads`, (await page(path, cookie)).status, 200);
  }
  check("the audit chain is intact", (await verifyAuditChain(db)).ok, true);
  const actions = await db.auditLog.groupBy({ by: ["action"] });
  for (const action of ["REMINDER_SENT", "FDR_ESCALATED", "ALERT_JOB_RUN", "ALERT_RULE_CREATED", "ALERT_RULE_CHANGED", "RELEASE_REQUESTED", "RELEASE_STEP"]) {
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
