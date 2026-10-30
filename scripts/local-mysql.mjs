// Runs a private MySQL server for this project on port 3307, with its data in
// mysql-data/. It needs no admin rights and never touches other MySQL installs.
// Usage: node scripts/local-mysql.mjs start | stop
import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";

const PORT = 3307;
const HOST = "127.0.0.1";
const DATABASE = "fdr_portal";
const APP_USER = "aicte";
const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "mysql-data");
const ENV_FILE = path.join(ROOT, ".env");
const INSTALL_ROOT = "C:\\Program Files\\MySQL";

function findBinDir() {
  if (process.env.MYSQL_BIN_DIR) return process.env.MYSQL_BIN_DIR;
  if (!existsSync(INSTALL_ROOT)) throw new Error(`MySQL not found in ${INSTALL_ROOT}. Set MYSQL_BIN_DIR.`);
  // Oldest first: 8.0 is the long-term release.
  const versions = readdirSync(INSTALL_ROOT)
    .filter((name) => name.startsWith("MySQL Server"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  for (const version of versions) {
    const bin = path.join(INSTALL_ROOT, version, "bin");
    if (existsSync(path.join(bin, "mysqld.exe"))) return bin;
  }
  throw new Error("No mysqld.exe found. Set MYSQL_BIN_DIR.");
}

function isListening() {
  return new Promise((resolve) => {
    const socket = net.connect({ host: HOST, port: PORT });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

async function waitFor(expected, seconds = 60) {
  for (let elapsed = 0; elapsed < seconds * 2; elapsed += 1) {
    if ((await isListening()) === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`MySQL did not ${expected ? "start" : "stop"} in time. See ${DATA_DIR}\\*.err`);
}

function startServer(bin) {
  const child = spawn(
    path.join(bin, "mysqld.exe"),
    [
      "--no-defaults",
      `--datadir=${DATA_DIR}`,
      `--port=${PORT}`,
      `--bind-address=${HOST}`,
      "--mysqlx=OFF",
      "--character-set-server=utf8mb4",
      "--collation-server=utf8mb4_unicode_ci",
    ],
    { detached: true, stdio: "ignore", windowsHide: true },
  );
  child.unref();
}

function runSql(bin, sql, user = "root") {
  execFileSync(path.join(bin, "mysql.exe"), ["--no-defaults", "-h", HOST, "-P", String(PORT), "-u", user, "-e", sql], {
    stdio: ["ignore", "ignore", "inherit"],
  });
}

function saveDatabaseUrl(password) {
  const url = `DATABASE_URL="mysql://${APP_USER}:${password}@${HOST}:${PORT}/${DATABASE}"`;
  const current = readFileSync(ENV_FILE, "utf8");
  writeFileSync(ENV_FILE, current.replace(/^\s*DATABASE_URL\s*=.*$/m, url));
}

async function start() {
  // A .env pointed at some other MySQL server doesn't need this one.
  const envText = readFileSync(ENV_FILE, "utf8");
  if (!envText.includes(`:${PORT}/`) && !envText.includes("YOUR_PASSWORD")) return;
  if (await isListening()) return;

  const bin = findBinDir();
  const firstRun = !existsSync(DATA_DIR);
  if (firstRun) {
    console.log("Creating the project's private MySQL...");
    execFileSync(path.join(bin, "mysqld.exe"), ["--no-defaults", "--initialize-insecure", `--datadir=${DATA_DIR}`], {
      stdio: "inherit",
    });
  }

  startServer(bin);
  await waitFor(true);

  if (firstRun) {
    const password = randomBytes(18).toString("hex");
    runSql(
      bin,
      [
        `CREATE DATABASE IF NOT EXISTS ${DATABASE} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
        `CREATE USER '${APP_USER}'@'%' IDENTIFIED BY '${password}'`,
        // Global rights because prisma migrate dev creates a temporary shadow database.
        `GRANT ALL PRIVILEGES ON *.* TO '${APP_USER}'@'%'`,
        // Nothing needs the passwordless root account from here on.
        "ALTER USER 'root'@'localhost' ACCOUNT LOCK",
      ].join(";"),
    );
    saveDatabaseUrl(password);
  }
  console.log(`MySQL is running on ${HOST}:${PORT}.`);
}

async function stop() {
  if (!(await isListening())) {
    console.log("MySQL is not running.");
    return;
  }
  const url = readFileSync(ENV_FILE, "utf8").match(/mysql:\/\/([^:]+):([^@]+)@/);
  execFileSync(path.join(findBinDir(), "mysqladmin.exe"), ["--no-defaults", "-h", HOST, "-P", String(PORT), "-u", url[1], "shutdown"], {
    env: { ...process.env, MYSQL_PWD: decodeURIComponent(url[2]) },
    stdio: "inherit",
  });
  await waitFor(false);
  console.log("MySQL stopped.");
}

const command = process.argv[2];
if (command === "start") await start();
else if (command === "stop") await stop();
else {
  console.error("Usage: node scripts/local-mysql.mjs start | stop");
  process.exit(1);
}
