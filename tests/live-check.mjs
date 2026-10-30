// Live end-to-end check of auth and RBAC. Needs `npm run dev` running and freshly seeded data.
// Usage: node tests/live-check.mjs
const BASE = "http://localhost:3000";
const PASSWORD = "Demo@12345";
let failures = 0;

function check(name, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  (got ${actual}, expected ${expected})`}`);
}

async function request(path, { method = "GET", cookie, body, origin = BASE } = {}) {
  const headers = {};
  if (method !== "GET" && origin) headers.Origin = origin;
  if (body) headers["Content-Type"] = "application/json";
  if (cookie) headers.Cookie = cookie;
  return fetch(BASE + path, { method, headers, body: body && JSON.stringify(body), redirect: "manual" });
}

async function login(email, password = PASSWORD, forwardedFor) {
  const response = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE, ...(forwardedFor ? { "X-Forwarded-For": forwardedFor } : {}) },
    body: JSON.stringify({ email, password }),
    redirect: "manual",
  });
  const cookie = response.headers.getSetCookie().find((value) => value.startsWith("aicte_session="))?.split(";")[0];
  const data = await response.json();
  return { status: response.status, cookie, data, setCookie: response.headers.getSetCookie().join(";") };
}

const ROLES = [
  ["institution@demo.test", "/institution"],
  ["officer@demo.test", "/officer"],
  ["authority@demo.test", "/authority"],
  ["admin@demo.test", "/admin"],
];

const cookies = {};
for (const [email, home] of ROLES) {
  const result = await login(email);
  cookies[home] = result.cookie;
  check(`${email} logs in`, result.status, 200);
  check(`${email} goes to ${home}`, result.data.redirectTo, home);
  check(`${email} cookie is httpOnly`, /httponly/i.test(result.setCookie), true);
  check(`${email} cookie is SameSite=Lax`, /samesite=lax/i.test(result.setCookie), true);
  check(`${home} page loads`, (await request(home, { cookie: result.cookie })).status, 200);

  for (const [, other] of ROLES.filter(([, path]) => path !== home)) {
    const response = await request(other, { cookie: result.cookie });
    check(`${email} refused at ${other}`, response.headers.get("location")?.endsWith("/forbidden"), true);
  }
  if (home !== "/admin") {
    check(`${email} gets 403 from admin API`, (await request("/api/admin/users", { cookie: result.cookie })).status, 403);
  }
}

check("anonymous API call gets 401", (await request("/api/auth/me")).status, 401);
check("anonymous page goes to login", (await request("/officer")).headers.get("location")?.includes("/login?next="), true);
check("garbage token gets 401", (await request("/api/auth/me", { cookie: "aicte_session=garbage" })).status, 401);
check("admin API works for admin", (await request("/api/admin/users", { cookie: cookies["/admin"] })).status, 200);
check("institution can't open audit page", (await request("/audit", { cookie: cookies["/institution"] })).headers.get("location")?.endsWith("/forbidden"), true);
check("officer can open reports page", (await request("/reports", { cookie: cookies["/officer"] })).status, 200);
check("cross-origin POST is rejected", (await request("/api/auth/logout", { method: "POST", cookie: cookies["/admin"], origin: "https://evil.example" })).status, 403);
check("POST without Origin is rejected", (await request("/api/auth/logout", { method: "POST", cookie: cookies["/admin"], origin: null })).status, 403);

// Registration leaves the account waiting for approval.
const stamp = Date.now();
const email = `new${stamp}@example.test`;
const password = "StrongPass123";
const registered = await request("/api/auth/register", {
  method: "POST",
  body: {
    institutionName: "Live Check Institute",
    aicteCode: `LIVE-${stamp}`,
    institutionType: "ENGINEERING",
    city: "Pune",
    state: "Maharashtra",
    region: "WEST",
    name: "Live Check",
    email,
    password,
  },
});
check("registration accepted", registered.status, 201);
check("weak password rejected", (await request("/api/auth/register", { method: "POST", body: { email: "x@y.test", password: "weak" } })).status, 400);
const pendingLogin = await login(email, password);
check("pending account can't log in", pendingLogin.status, 403);
check("pending account gets the right reason", pendingLogin.data.error?.code, "ACCOUNT_PENDING");

const users = await (await request("/api/admin/users", { cookie: cookies["/admin"] })).json();
const created = users.users.find((user) => user.email === email);
const adminPatch = (id, status, cookie = cookies["/admin"]) =>
  request(`/api/admin/users/${id}`, { method: "PATCH", cookie, body: { status } });

check("non-admin can't approve", (await adminPatch(created.id, "ACTIVE", cookies["/officer"])).status, 403);
check("admin approves account", (await adminPatch(created.id, "ACTIVE")).status, 200);
const approved = await login(email, password);
check("approved account logs in", approved.status, 200);
check("session works before suspension", (await request("/api/auth/me", { cookie: approved.cookie })).status, 200);
check("admin suspends account", (await adminPatch(created.id, "SUSPENDED")).status, 200);
check("suspension ends the existing session", (await request("/api/auth/me", { cookie: approved.cookie })).status, 401);
check("suspended page visit goes to clear the cookie", (await request("/institution", { cookie: approved.cookie })).headers.get("location")?.endsWith("/api/auth/clear"), true);
const suspendedLogin = await login(email, password);
check("suspended account can't log in", suspendedLogin.data.error?.code, "ACCOUNT_SUSPENDED");

// Lockout, using its own address so the demo accounts stay usable.
for (let attempt = 1; attempt <= 5; attempt += 1) {
  check(`wrong password ${attempt} gets 401`, (await login("officer@demo.test", "wrong-password", "203.0.113.9")).status, 401);
}
check("sixth attempt is locked out", (await login("officer@demo.test", "wrong-password", "203.0.113.9")).status, 429);
check("correct password is also locked from that address", (await login("officer@demo.test", PASSWORD, "203.0.113.9")).status, 429);
check("other addresses aren't affected", (await login("officer@demo.test", PASSWORD, "203.0.113.10")).status, 200);

// Public FDR tracking must never reveal private details.
const track = (referenceNo) => request("/api/track", { method: "POST", body: { referenceNo } });
const tracked = await track("FDR-2026-000001");
const trackedBody = await tracked.json();
check("tracking finds a seeded FDR", tracked.status, 200);
check("tracking returns only public fields", Object.keys(trackedBody).sort().join(), "lastUpdated,referenceNo,status,trustLevel,validity");
check("tracking accepts lowercase", (await track("fdr-2026-000001")).status, 200);
check("tracking reports an unknown reference", (await track("FDR-2026-999999")).status, 404);
check("tracking rejects a malformed reference", (await track("1 OR 1=1")).status, 400);
let lastTrack = 200;
for (let attempt = 0; attempt < 30; attempt += 1) lastTrack = (await track("FDR-2026-000001")).status;
check("tracking is rate limited", lastTrack, 429);

const landing = await (await request("/")).text();
check("landing page has no password field", /type="password"/.test(landing), false);
check("landing page reports its login route", landing.includes('href="/login"'), true);
const loginPage = await (await request("/login")).text();
check("demo accounts show on login in development", loginPage.includes("officer@demo.test"), true);

// Changing a password
const staffEmail = `staff${stamp}@example.test`;
const createdStaff = await (await request("/api/admin/users", { method: "POST", cookie: cookies["/admin"], body: { name: "Password Check", email: staffEmail, role: "SCRUTINY_OFFICER" } })).json();
const staffLogin = await login(staffEmail, createdStaff.temporaryPassword);
const otherSession = (await login(staffEmail, createdStaff.temporaryPassword)).cookie;
const change = (cookie, currentPassword, newPassword) => request("/api/auth/password", { method: "POST", cookie, body: { currentPassword, newPassword } });
check("a wrong current password is refused", (await (await change(staffLogin.cookie, "not-the-password", "NewStrongPass123")).json()).error.code, "WRONG_PASSWORD");
check("a weak new password is refused", (await change(staffLogin.cookie, createdStaff.temporaryPassword, "weak")).status, 400);
check("the same password is refused", (await (await change(staffLogin.cookie, createdStaff.temporaryPassword, createdStaff.temporaryPassword)).json()).error.code, "SAME_PASSWORD");
check("anonymous can't change a password", (await change("", "x", "NewStrongPass123")).status, 401);
const changed = await change(staffLogin.cookie, createdStaff.temporaryPassword, "NewStrongPass123");
check("the password changes", changed.status, 200);
const freshCookie = changed.headers.getSetCookie().find((value) => value.startsWith("aicte_session="))?.split(";")[0];
check("this browser stays logged in", (await request("/api/auth/me", { cookie: freshCookie })).status, 200);
check("other sessions are ended", (await request("/api/auth/me", { cookie: otherSession })).status, 401);
check("the old password stops working", (await login(staffEmail, createdStaff.temporaryPassword)).status, 401);
check("the new password works", (await login(staffEmail, "NewStrongPass123")).status, 200);
check("the account page loads", (await request("/account", { cookie: freshCookie })).status, 200);

// Malformed requests are the caller's mistake, not a server error
const malformed = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json", Origin: BASE }, body: "{not json" });
check("broken JSON gets 400, not 500", malformed.status, 400);

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} checks FAILED.`);
process.exit(failures === 0 ? 0 : 1);
