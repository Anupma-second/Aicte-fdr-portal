import { constants } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import { getBankVerificationService } from "@/lib/bank";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";

export type HealthState = "ok" | "warning" | "error";
export type HealthCheck = { key: string; state: HealthState; value: string | null };

async function databaseCheck(): Promise<HealthCheck> {
  const started = Date.now();
  try {
    await db.$queryRaw`SELECT 1`;
    return { key: "database", state: "ok", value: `${Date.now() - started} ms` };
  } catch {
    return { key: "database", state: "error", value: null };
  }
}

async function storageCheck(): Promise<HealthCheck> {
  try {
    await access(path.resolve(getEnv().UPLOAD_DIR), constants.W_OK);
    return { key: "storage", state: "ok", value: null };
  } catch {
    return { key: "storage", state: "error", value: null };
  }
}

async function alertJobCheck(now: Date): Promise<HealthCheck & { lastRun: Date | null }> {
  const last = await db.auditLog.findFirst({ where: { action: "ALERT_JOB_RUN" }, orderBy: { id: "desc" }, select: { occurredAt: true } });
  const twoDays = 2 * 24 * 60 * 60 * 1000;
  return {
    key: "alertJob",
    state: last && now.getTime() - last.occurredAt.getTime() < twoDays ? "ok" : "warning",
    value: null,
    lastRun: last?.occurredAt ?? null,
  };
}

/** Reports only states, never addresses, users or keys. */
export async function getSystemHealth(now = new Date()) {
  const [database, storage, alertJob] = await Promise.all([databaseCheck(), storageCheck(), alertJobCheck(now)]);
  const env = getEnv();
  return {
    checks: [database, storage, alertJob],
    lastJobRun: alertJob.lastRun,
    integrations: {
      bank: getBankVerificationService().adapterName,
      email: env.SMTP_HOST ? "smtp" : "console",
      ocr: "local",
      storage: "local",
    },
  };
}
