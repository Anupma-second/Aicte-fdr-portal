// End-to-end check of management and admin features against the running app. Needs `npm run dev` and fresh seed data.
// Usage: npx tsx --env-file=.env tests/admin-check.ts
import { PrismaClient } from "@prisma/client";
import ExcelJS from "exceljs";
import { verifyAuditChain } from "../src/lib/audit/chain";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const db = new PrismaClient();
let failures = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  (got ${actual}, expected ${expected})`}`);
}

async function login(email: string, password = "Demo@12345") {
  const response = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ email, password }),
  });
  return { status: response.status, cookie: response.headers.getSetCookie().find((value) => value.startsWith("aicte_session="))?.split(";")[0] ?? "" };
}

const send = (path: string, cookie: string, method = "GET", body?: object) =>
  fetch(BASE + path, {
    method,
    redirect: "manual",
    headers: { Cookie: cookie, ...(method === "GET" ? {} : { Origin: BASE }), ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });

async function main() {
  const institution = (await login("institution@demo.test")).cookie;
  const officer = (await login("officer@demo.test")).cookie;
  const authority = (await login("authority@demo.test")).cookie;
  const admin = (await login("admin@demo.test")).cookie;
  const stamp = String(Date.now()).slice(-7);

  // Reports
  for (const type of ["pending", "upcoming", "missing", "overdue", "region"]) {
    const xlsx = await send(`/api/reports/${type}?format=xlsx`, officer);
    check(`${type} Excel downloads`, xlsx.status, 200);
    const bytes = Buffer.from(await xlsx.arrayBuffer());
    check(`${type} Excel is a real file`, bytes.subarray(0, 2).toString(), "PK");
    const pdf = await send(`/api/reports/${type}?format=pdf`, authority);
    check(`${type} PDF downloads`, pdf.status, 200);
    check(`${type} PDF is a real file`, Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString(), "%PDF-");
  }
  const overdueFile = Buffer.from(await (await send("/api/reports/overdue?format=xlsx", admin)).arrayBuffer());
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(overdueFile as unknown as ArrayBuffer);
  const expectedOverdue = await db.fdr.count({ where: { status: { in: ["ACTIVE", "EXPIRING", "MATURED"] }, maturityDate: { lt: new Date() } } });
  check("the overdue report has the right rows", workbook.worksheets[0].rowCount - 1, expectedOverdue);
  check("an institution can't download reports", (await send("/api/reports/overdue?format=pdf", institution)).status, 403);
  check("anonymous can't download reports", (await send("/api/reports/overdue?format=pdf", "")).status, 401);
  check("an unknown report is refused", (await send("/api/reports/secrets?format=pdf", officer)).status, 400);
  check("an unknown format is refused", (await send("/api/reports/overdue?format=exe", officer)).status, 400);
  check("exports are audited", await db.auditLog.count({ where: { action: "REPORT_EXPORTED" } }) > 0, true);

  // Audit integrity and tamper simulation
  const verify = async (cookie = admin) => (await send("/api/audit/verify", cookie)).json();
  check("the chain starts intact", (await verify()).ok, true);
  check("the authority can verify", (await verify(authority)).ok, true);
  check("an officer can't verify", (await send("/api/audit/verify", officer)).status, 403);
  check("an institution can't verify", (await send("/api/audit/verify", institution)).status, 403);
  const simulate = (action: string, cookie = admin) => send("/api/audit/simulation", cookie, "POST", { action });
  check("the authority can't tamper", (await simulate("START", authority)).status, 403);
  check("an officer can't tamper", (await simulate("START", officer)).status, 403);
  const started = await simulate("START");
  check("the admin starts the simulation", started.status, 200);
  const { entryId } = await started.json();
  check("it can't run twice", (await simulate("START")).status, 409);
  const broken = await verify();
  check("the check catches it", broken.ok, false);
  check("the check names the edited entry", broken.brokenAtId, entryId);
  check("the check gives the reason", broken.reason, "HASH_MISMATCH");
  const auditPage = await (await send(`/audit?entry=${entryId}`, admin)).text();
  check("the audit page can show that entry", auditPage.includes("__tamperSimulation"), true);
  check("new entries still append while broken", (await send("/api/reports/region?format=pdf", officer)).status, 200);
  check("the admin restores it", (await simulate("STOP")).status, 200);
  const restored = await verify();
  check("the chain is intact again", restored.ok, true);
  check("stopping twice is refused", (await simulate("STOP")).status, 409);
  const simulationAudit = await db.auditLog.count({ where: { action: { in: ["TAMPER_SIMULATION_STARTED", "TAMPER_SIMULATION_ENDED"] } } });
  check("the simulation itself is audited", simulationAudit, 2);

  for (const path of ["/audit", "/audit?action=AUTH_LOGIN", "/audit?actor=admin", "/audit?page=2", "/audit?entry=abc", "/audit?page=-1"]) {
    check(`${path} loads`, (await send(path, authority)).status, 200);
  }
  check("an officer can't open the audit page", (await send("/audit", officer)).headers.get("location")?.endsWith("/forbidden"), true);

  // Institution approval
  const pending = await db.user.findFirstOrThrow({ where: { status: "PENDING_APPROVAL" } });
  check("a non-admin can't approve", (await send(`/api/admin/users/${pending.id}`, authority, "PATCH", { status: "ACTIVE" })).status, 403);
  check("the admin approves", (await send(`/api/admin/users/${pending.id}`, admin, "PATCH", { status: "ACTIVE" })).status, 200);
  check("the user is told", await db.notification.count({ where: { userId: pending.id, kind: "ACCOUNT" } }), 1);

  // Staff accounts and roles
  const email = `staff${stamp}@example.test`;
  const created = await send("/api/admin/users", admin, "POST", { name: "New Officer", email, role: "SCRUTINY_OFFICER" });
  check("the admin creates an officer", created.status, 201);
  const { id: staffId, temporaryPassword } = await created.json();
  const stored = await db.user.findUniqueOrThrow({ where: { id: staffId } });
  check("the password isn't stored in clear", stored.passwordHash.includes(temporaryPassword), false);
  check("the same email is refused", (await send("/api/admin/users", admin, "POST", { name: "Again", email, role: "ADMIN" })).status, 409);
  check("an institution account can't be created here", (await send("/api/admin/users", admin, "POST", { name: "Inst User", email: `i${email}`, role: "INSTITUTION" })).status, 400);
  check("a non-admin can't create users", (await send("/api/admin/users", authority, "POST", { name: "Nope Nope", email: `n${email}`, role: "ADMIN" })).status, 403);
  const staff = await login(email, temporaryPassword);
  check("the new officer can log in", staff.status, 200);
  check("they reach the officer dashboard", (await send("/officer", staff.cookie)).status, 200);

  const adminUser = await db.user.findUniqueOrThrow({ where: { email: "admin@demo.test" } });
  check("an admin can't change their own account", (await send(`/api/admin/users/${adminUser.id}`, admin, "PATCH", { status: "SUSPENDED" })).status, 400);
  const demoInstitution = await db.user.findUniqueOrThrow({ where: { email: "institution@demo.test" } });
  check("an institution user can't become staff", (await send(`/api/admin/users/${demoInstitution.id}`, admin, "PATCH", { role: "ADMIN" })).status, 400);
  check("a role can't be set to institution", (await send(`/api/admin/users/${staffId}`, admin, "PATCH", { role: "INSTITUTION" })).status, 400);
  check("an empty change is refused", (await send(`/api/admin/users/${staffId}`, admin, "PATCH", {})).status, 400);

  check("the admin changes a role", (await send(`/api/admin/users/${staffId}`, admin, "PATCH", { role: "COMPETENT_AUTHORITY" })).status, 200);
  check("a role change ends the old session", (await send("/api/auth/me", staff.cookie)).status, 401);
  const relogged = await login(email, temporaryPassword);
  check("the new role takes effect", (await send("/authority", relogged.cookie)).status, 200);
  check("the old role's page is closed", (await send("/officer", relogged.cookie)).headers.get("location")?.endsWith("/forbidden"), true);
  check("role changes are audited", await db.auditLog.count({ where: { action: "USER_ROLE_CHANGED", entityId: staffId } }), 1);

  // Reassigning a case
  const fdr = await db.fdr.findFirstOrThrow({ where: { status: "UNDER_SCRUTINY" } });
  const officerB = await db.user.create({
    data: { email: `b${email}`, name: "Officer B", role: "SCRUTINY_OFFICER", status: "ACTIVE", passwordHash: stored.passwordHash },
  });
  const officerBCookie = (await login(`b${email}`, temporaryPassword)).cookie;
  const note = { action: "OBSERVE", note: "A note from officer B." };
  check("before reassignment, officer B can't act", (await send(`/api/fdrs/${fdr.id}/actions`, officerBCookie, "POST", note)).status, 403);
  check("a non-admin can't reassign", (await send(`/api/admin/fdrs/${fdr.id}/assign`, officer, "POST", { officerId: officerB.id })).status, 403);
  check("only an officer can be assigned", (await send(`/api/admin/fdrs/${fdr.id}/assign`, admin, "POST", { officerId: adminUser.id })).status, 400);
  check("the admin reassigns", (await send(`/api/admin/fdrs/${fdr.id}/assign`, admin, "POST", { officerId: officerB.id })).status, 200);
  check("officer B can now act", (await send(`/api/fdrs/${fdr.id}/actions`, officerBCookie, "POST", note)).status, 200);
  check("the first officer can't any more", (await send(`/api/fdrs/${fdr.id}/actions`, officer, "POST", note)).status, 403);
  check("officer B is told", await db.notification.count({ where: { userId: officerB.id, fdrId: fdr.id } }), 1);

  // Pages
  const pages: [string, string][] = [["/authority", authority], ["/admin", admin], ["/admin/users", admin], ["/admin/users?role=ADMIN&status=ACTIVE&q=demo", admin], ["/admin/users?page=2", admin], ["/reports", officer], ["/reports", admin], [`/fdrs/${fdr.id}`, admin]];
  for (const [path, cookie] of pages) check(`${path} loads`, (await send(path, cookie)).status, 200);
  check("an authority can't open user management", (await send("/admin/users", authority)).headers.get("location")?.endsWith("/forbidden"), true);
  const adminPage = await (await send("/admin", admin)).text();
  check("health doesn't reveal the database address", adminPage.includes("3307") || adminPage.includes("mysql://"), false);
  check("the mock bank is labelled as simulated", /simulated/i.test(adminPage), true);

  check("the audit chain is intact at the end", (await verifyAuditChain(db)).ok, true);
  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} checks FAILED.`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
