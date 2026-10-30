// Start command for hosted deployments such as Render.
// Applies database updates, adds demo data to an empty database if asked to, then starts the app.
import { execFileSync, spawn } from "node:child_process";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const ROOT = process.cwd();
const prisma = path.join(ROOT, "node_modules/prisma/build/index.js");
const next = path.join(ROOT, "node_modules/next/dist/bin/next");

execFileSync(process.execPath, [prisma, "migrate", "deploy"], { stdio: "inherit" });

if (process.env.DEMO_SEED === "true") {
  const db = new PrismaClient();
  const institutions = await db.institution.count();
  await db.$disconnect();
  // Only ever into an empty database, so a restart can't wipe anything.
  if (institutions === 0) {
    console.log("Empty database: adding demo data...");
    execFileSync(process.execPath, [prisma, "db", "seed"], { stdio: "inherit", env: { ...process.env, NODE_ENV: "development" } });
  }
}

const server = spawn(process.execPath, [next, "start"], { stdio: "inherit" });
server.on("exit", (code) => process.exit(code ?? 0));
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => server.kill(signal));
