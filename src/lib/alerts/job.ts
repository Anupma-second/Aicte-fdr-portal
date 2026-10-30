import type { EscalationLevel, Prisma } from "@prisma/client";
import { appendAudit } from "@/lib/audit/chain";
import { db } from "@/lib/db";
import { daysUntil } from "@/lib/fdr/dates";
import { applyDateStatus } from "@/lib/fdr/scrutiny";
import { recomputeRisk } from "@/lib/fdr/service";
import { activeUsersWithRole, institutionUsers, notify } from "@/lib/notifications";
import { deliverEmails, type QueuedEmail } from "@/lib/notifications/email";
import { dueEscalations, dueReminder } from "./rules";

type Tx = Prisma.TransactionClient;

export type JobSummary = { checked: number; reminders: number; escalations: number; emails: number; failed: number };

const SYSTEM_ACTOR = { actorId: null, actorLabel: "system:alert-job" };
const WATCHED = ["ACTIVE", "EXPIRING", "MATURED"] as const;
const TRANSACTION_OPTIONS = { timeout: 20_000 };

async function recipientsFor(tx: Tx, level: EscalationLevel, fdr: { institutionId: string; assignedOfficerId: string | null }) {
  if (level === "INSTITUTION") return institutionUsers(tx, fdr.institutionId);
  if (level === "SCRUTINY_OFFICER") {
    return fdr.assignedOfficerId ? [fdr.assignedOfficerId] : activeUsersWithRole(tx, "SCRUTINY_OFFICER");
  }
  return activeUsersWithRole(tx, "COMPETENT_AUTHORITY");
}

/** Safe to run any number of times a day: dedupe keys and the escalation log stop repeats. */
export async function runAlertJob(now = new Date()): Promise<JobSummary> {
  const rules = await db.alertRule.findMany({ where: { isActive: true } });
  const fdrs = await db.fdr.findMany({ where: { status: { in: [...WATCHED] } }, select: { id: true } });
  const summary: JobSummary = { checked: fdrs.length, reminders: 0, escalations: 0, emails: 0, failed: 0 };
  const emails: QueuedEmail[] = [];

  for (const { id } of fdrs) {
    try {
      // One transaction per FDR, so one bad record can't stop the rest.
      const queued = await db.$transaction(async (tx) => {
        await applyDateStatus(tx, id, now);
        const fdr = await tx.fdr.findUniqueOrThrow({ where: { id } });
        const days = daysUntil(fdr.maturityDate, now);
        const params = { reference: fdr.referenceNo, days: Math.abs(days) };
        const link = `/fdrs/${id}`;
        const queue: QueuedEmail[] = [];

        const reminder = dueReminder(days, rules);
        if (reminder) {
          const sent = await notify(tx, {
            userIds: await institutionUsers(tx, fdr.institutionId),
            fdrId: id,
            kind: "REMINDER",
            textKey: "REMINDER",
            params,
            link,
            dedupeKey: `${id}:${reminder.id}`,
            email: true,
          });
          if (sent.length > 0) {
            queue.push(...sent);
            summary.reminders += 1;
            await tx.fdrEvent.create({ data: { fdrId: id, type: "ALERT_SENT", title: `${reminder.days}-day reminder sent`, detail: String(reminder.days), metadata: { days: reminder.days } } });
            await appendAudit(tx, { ...SYSTEM_ACTOR, action: "REMINDER_SENT", entityType: "Fdr", entityId: id, payload: { ruleDays: reminder.days, daysToMaturity: days } });
          }
        }

        let previousLevel: EscalationLevel | null = null;
        for (const rule of dueEscalations(days, rules)) {
          const done = await tx.escalationLog.findFirst({ where: { fdrId: id, ruleId: rule.id }, select: { id: true } });
          if (!done) {
            const userIds = await recipientsFor(tx, rule.targetLevel, fdr);
            await tx.escalationLog.create({
              data: { fdrId: id, ruleId: rule.id, fromLevel: previousLevel, toLevel: rule.targetLevel, toUserId: userIds[0], daysOverdue: -days },
            });
            queue.push(
              ...(await notify(tx, {
                userIds,
                fdrId: id,
                kind: "ESCALATION",
                textKey: rule.targetLevel === "INSTITUTION" ? "OVERDUE" : "ESCALATED",
                params,
                link,
                dedupeKey: `${id}:${rule.id}`,
                email: true,
              })),
            );
            summary.escalations += 1;
            await tx.fdrEvent.create({ data: { fdrId: id, type: "ESCALATED", title: `Escalated to ${rule.targetLevel}`, metadata: { to: rule.targetLevel, daysOverdue: -days } } });
            await appendAudit(tx, { ...SYSTEM_ACTOR, action: "FDR_ESCALATED", entityType: "Fdr", entityId: id, payload: { from: previousLevel, to: rule.targetLevel, daysOverdue: -days } });
          }
          previousLevel = rule.targetLevel;
        }

        await recomputeRisk(tx, id, now);
        return queue;
      }, TRANSACTION_OPTIONS);
      emails.push(...queued);
    } catch (error) {
      summary.failed += 1;
      console.error(`Alert job failed for FDR ${id}`, error);
    }
  }

  await deliverEmails(emails);
  summary.emails = emails.length;
  await db.$transaction((tx) => appendAudit(tx, { ...SYSTEM_ACTOR, action: "ALERT_JOB_RUN", entityType: "System", entityId: "alerts", payload: { ...summary } }));
  return summary;
}
