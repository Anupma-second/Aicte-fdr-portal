import type { SessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { appendAudit } from "./chain";

const MARKER = '{"__tamperSimulation":true,"original":';

/**
 * A demo of the integrity check. It really does edit one stored audit row, the way someone
 * with database access could, and keeps the original inside the edit so it can be put back.
 * Off in production unless ALLOW_TAMPER_SIMULATION=true, because it writes to the audit trail.
 */
export function isSimulationAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.ALLOW_TAMPER_SIMULATION === "true";
}

export async function getActiveSimulation(): Promise<string | null> {
  const row = await db.auditLog.findFirst({ where: { payload: { startsWith: MARKER } }, select: { id: true } });
  return row ? row.id.toString() : null;
}

function assertAllowed() {
  if (!isSimulationAllowed()) throw new ApiError(403, "SIMULATION_DISABLED", "Tamper simulation is turned off here");
}

export async function startSimulation(user: SessionUser): Promise<string> {
  assertAllowed();
  return db.$transaction(async (tx) => {
    if (await tx.auditLog.findFirst({ where: { payload: { startsWith: MARKER } }, select: { id: true } })) {
      throw new ApiError(409, "SIMULATION_ACTIVE", "A simulation is already running");
    }
    const total = await tx.auditLog.count();
    if (total === 0) throw new ApiError(409, "AUDIT_EMPTY", "There is nothing to tamper with");
    const target = await tx.auditLog.findFirstOrThrow({ orderBy: { id: "asc" }, skip: Math.floor(total / 2) });

    await tx.auditLog.update({
      where: { id: target.id },
      data: { payload: `${MARKER}${JSON.stringify(target.payload)}}` },
    });
    await appendAudit(tx, {
      actorId: user.id,
      actorLabel: user.email,
      action: "TAMPER_SIMULATION_STARTED",
      entityType: "AuditLog",
      entityId: target.id.toString(),
    });
    return target.id.toString();
  });
}

export async function stopSimulation(user: SessionUser): Promise<void> {
  // Allowed even if the setting has since been turned off, so a row is never left edited.
  await db.$transaction(async (tx) => {
    const row = await tx.auditLog.findFirst({ where: { payload: { startsWith: MARKER } } });
    if (!row) throw new ApiError(409, "SIMULATION_NOT_ACTIVE", "No simulation is running");
    const { original } = JSON.parse(row.payload) as { original: string };
    await tx.auditLog.update({ where: { id: row.id }, data: { payload: original } });
    await appendAudit(tx, {
      actorId: user.id,
      actorLabel: user.email,
      action: "TAMPER_SIMULATION_ENDED",
      entityType: "AuditLog",
      entityId: row.id.toString(),
    });
  });
}
