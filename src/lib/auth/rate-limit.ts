import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/errors";

const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;
const MAX_PER_IP_AND_EMAIL = 5;
// Catches IP rotation or a spoofed X-Forwarded-For, high enough that a stranger
// can't easily lock out a real user from another network.
const MAX_PER_EMAIL = 20;

function hashKey(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function keysFor(ip: string, email: string) {
  const normalized = email.trim().toLowerCase();
  return [
    { key: hashKey(`ip+email:${ip}:${normalized}`), max: MAX_PER_IP_AND_EMAIL },
    { key: hashKey(`email:${normalized}`), max: MAX_PER_EMAIL },
  ];
}

export async function assertNotLocked(ip: string, email: string, now = new Date()): Promise<void> {
  const rows = await db.loginAttempt.findMany({
    where: { key: { in: keysFor(ip, email).map((entry) => entry.key) } },
  });
  const lockedUntil = rows
    .map((row) => row.lockedUntil)
    .filter((date): date is Date => date !== null && date > now)
    .sort((a, b) => b.getTime() - a.getTime())[0];
  if (lockedUntil) {
    const minutes = Math.ceil((lockedUntil.getTime() - now.getTime()) / 60000);
    throw new ApiError(429, "TOO_MANY_ATTEMPTS", `Too many attempts. Try again in ${minutes} minutes.`);
  }
}

export async function recordFailure(ip: string, email: string, now = new Date()): Promise<void> {
  for (const { key, max } of keysFor(ip, email)) {
    const row = await db.loginAttempt.findUnique({ where: { key } });
    const expired = !row || now.getTime() - row.windowStart.getTime() > WINDOW_MS;
    const count = expired ? 1 : row.count + 1;
    const lockedUntil = count >= max ? new Date(now.getTime() + LOCK_MS) : null;
    await db.loginAttempt.upsert({
      where: { key },
      create: { key, count, windowStart: now, lockedUntil },
      update: { count, windowStart: expired ? now : row.windowStart, lockedUntil },
    });
  }
}

export async function clearFailures(ip: string, email: string): Promise<void> {
  // Only the IP + email counter: a successful login mustn't reset the per-email ceiling for an attacker.
  await db.loginAttempt.deleteMany({ where: { key: keysFor(ip, email)[0].key } });
}

/** Fixed-window limit for public endpoints. Counts every call, not just failures. */
export async function consumeRateLimit(scope: string, identifier: string, max: number, now = new Date()): Promise<void> {
  const key = hashKey(`${scope}:${identifier}`);
  const row = await db.loginAttempt.findUnique({ where: { key } });
  const expired = !row || now.getTime() - row.windowStart.getTime() > WINDOW_MS;
  const count = expired ? 1 : row.count + 1;
  if (count > max) throw new ApiError(429, "TOO_MANY_ATTEMPTS", "Too many requests. Please try again later.");
  await db.loginAttempt.upsert({
    where: { key },
    create: { key, count, windowStart: now },
    update: { count, windowStart: expired ? now : row.windowStart },
  });
}
