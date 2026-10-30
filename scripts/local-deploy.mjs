// Runs the portal in production mode on this computer, with no online services.
// Usage: node scripts/local-deploy.mjs start | stop
import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";

const ROOT = process.cwd();
const PORT = Number(process.env.PORT ?? 3000);
const DB_PORT = 3307;
const DB_CHECK_MS = 10_000;
const DIST = ".next-local";
const ENV_FILE = path.join(ROOT, ".env");
const SOURCES = ["src", "messages", "public", "prisma", "package.json", "next.config.mjs"];

const next = path.join(ROOT, "node_modules/next/dist/bin/next");
const prisma = path.join(ROOT, "node_modules/prisma/build/index.js");
const run = (args, env = {}) => execFileSync(process.execPath, args, { stdio: "inherit", env: { ...process.env, ...env } });

function ensureEnv() {
  if (!existsSync(ENV_FILE)) {
    copyFileSync(path.join(ROOT, ".env.example"), ENV_FILE);
    console.log("Created .env");
  }
  let text = readFileSync(ENV_FILE, "utf8");
  text = text
    .replace(/^JWT_SECRET=""$/m, `JWT_SECRET="${randomBytes(48).toString("base64url")}"`)
    .replace(/^FILE_ENCRYPTION_KEY=""$/m, `FILE_ENCRYPTION_KEY="${randomBytes(32).toString("hex")}"`);
  // This deployment is for local demos, and the demo script uses the tamper simulation.
  if (/^ALLOW_TAMPER_SIMULATION=/m.test(text)) text = text.replace(/^ALLOW_TAMPER_SIMULATION=.*$/m, 'ALLOW_TAMPER_SIMULATION="true"');
  else text = `${text.trimEnd()}\n\nALLOW_TAMPER_SIMULATION="true"\n`;
  writeFileSync(ENV_FILE, text);
}

function newestChange(target) {
  const stats = statSync(target);
  if (!stats.isDirectory()) return stats.mtimeMs;
  return readdirSync(target).reduce((latest, name) => Math.max(latest, newestChange(path.join(target, name))), stats.mtimeMs);
}

function buildIsCurrent() {
  const marker = path.join(ROOT, DIST, "BUILD_ID");
  if (!existsSync(marker)) return false;
  const built = statSync(marker).mtimeMs;
  return SOURCES.every((source) => newestChange(path.join(ROOT, source)) <= built);
}

function portInUse(port = PORT) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

async function seedIfEmpty() {
  process.loadEnvFile(ENV_FILE);
  const { PrismaClient } = await import("@prisma/client");
  const db = new PrismaClient();
  const count = await db.institution.count();
  await db.$disconnect();
  if (count > 0) return;
  console.log("Adding demo data...");
  // The seed refuses production on purpose; this private local database is the exception.
  run([prisma, "db", "seed"], { NODE_ENV: "development" });
}

async function start() {
  if (await portInUse()) {
    console.error(`Port ${PORT} is already in use. Stop the other copy first with: npm run local:stop`);
    process.exit(1);
  }
  ensureEnv();
  run(["scripts/local-mysql.mjs", "start"]);
  run([prisma, "migrate", "deploy"]);
  await seedIfEmpty();
  if (buildIsCurrent()) console.log("Build is up to date.");
  else {
    console.log("Building the app. This takes about a minute...");
    run([next, "build"], { NEXT_DIST_DIR: DIST, NODE_ENV: "production" });
  }
  console.log(`\nStarting. Open http://localhost:${PORT}\nPress Ctrl+C to stop.\n`);
  const server = spawn(process.execPath, [next, "start", "-p", String(PORT)], {
    stdio: "inherit",
    env: { ...process.env, NEXT_DIST_DIR: DIST, NODE_ENV: "production" },
  });
  server.on("exit", (code) => process.exit(code ?? 0));
  watchDatabase();
}

/** Brings the private MySQL back if something ends it, so logins don't stay broken until a restart. */
function watchDatabase() {
  let restarting = false;
  setInterval(async () => {
    if (restarting || (await portInUse(DB_PORT))) return;
    restarting = true;
    console.log("The database stopped. Restarting it...");
    const restart = spawn(process.execPath, ["scripts/local-mysql.mjs", "start"], { stdio: "inherit" });
    restart.on("exit", () => {
      restarting = false;
    });
  }, DB_CHECK_MS);
}

function stop() {
  // Finds whatever is listening on the port, so this also stops a copy started in another window.
  execFileSync(
    "powershell",
    ["-NoProfile", "-Command", `Get-NetTCPConnection -LocalPort ${PORT} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -Confirm:$false }`],
    { stdio: "inherit" },
  );
  run(["scripts/local-mysql.mjs", "stop"]);
  console.log("Stopped.");
}

const command = process.argv[2];
if (command === "start") await start();
else if (command === "stop") stop();
else {
  console.error("Usage: node scripts/local-deploy.mjs start | stop");
  process.exit(1);
}
