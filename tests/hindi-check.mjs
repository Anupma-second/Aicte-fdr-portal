// Lists English text left on pages viewed in Hindi. Needs `npm run dev`. Names, emails and references are user data, so they are expected.
// Usage: node tests/hindi-check.mjs
const BASE = process.env.BASE_URL ?? "http://localhost:3000";

async function login(email) {
  const response = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ email, password: "Demo@12345" }),
  });
  return response.headers.getSetCookie().find((value) => value.startsWith("aicte_session="))?.split(";")[0] ?? "";
}

function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .split(/<[^>]+>/)
    .map((part) => part.replace(/&[a-z#0-9]+;/gi, " ").trim())
    .filter(Boolean);
}

// User data and technical tokens that stay as they are.
const EXPECTED = /^(FDR-\d|[A-Z0-9/-]{6,}$|SIH\d+|PNG|JPEG|IST|English$|N\/A$)|@|\.test\b|Bank|Institute|College|School|Polytechnic|Branch|Road|Lines|Centre|Demo\)|Section|Office|Officer$|Delhi|Pradesh|Maharashtra|Karnataka|Tamil|Kerala|Telangana|Gujarat|Rajasthan|Punjab|Haryana|Bengal|Odisha|Bihar|Jharkhand|Goa|Assam|Meghalaya|Chhattisgarh|Andaman|Arunachal|Chandigarh|Dadra|Himachal|Jammu|Ladakh|Lakshadweep|Manipur|Mizoram|Nagaland|Puducherry|Sikkim|Tripura|Uttarakhand|^[A-Z_]{3,}$|^[0-9a-f]{12}|^\{|\.pdf$|^SHA-256|^AES-256|^Rs/;

const accounts = {
  "": ["/", "/login", "/register"],
  "institution@demo.test": ["/institution", "/fdrs", "/fdrs/new", "/calendar", "/notifications"],
  "officer@demo.test": ["/officer", "/fdrs", "/reports"],
  "authority@demo.test": ["/authority", "/audit", "/reports"],
  "admin@demo.test": ["/admin", "/admin/users", "/audit"],
};

let found = 0;
for (const [email, paths] of Object.entries(accounts)) {
  const session = email ? await login(email) : "";
  for (const path of paths) {
    const response = await fetch(BASE + path, { headers: { Cookie: `aicte_locale=hi; ${session}` }, redirect: "manual" });
    const html = await response.text();
    const firstFdr = path === "/fdrs" ? /href="(\/fdrs\/[a-z0-9]{20,})"/.exec(html)?.[1] : null;
    if (firstFdr) paths.push(firstFdr);
    const leftovers = [...new Set(visibleText(html))].filter((text) => /[A-Za-z]{3,}/.test(text) && !EXPECTED.test(text));
    if (leftovers.length > 0) {
      found += leftovers.length;
      console.log(`${path} (${email || "public"}):\n  ${leftovers.slice(0, 40).join("\n  ")}`);
    }
  }
}
console.log(found === 0 ? "No English labels found." : `\n${found} English strings to review.`);
