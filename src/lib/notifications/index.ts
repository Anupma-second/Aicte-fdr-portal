import type { NotificationKind, Prisma, Role } from "@prisma/client";
import type { QueuedEmail } from "./email";
import { encodeText, type NotificationParams } from "./format";

type Tx = Prisma.TransactionClient;

export type NotifyInput = {
  userIds: string[];
  fdrId?: string;
  kind: NotificationKind;
  /** A key under notifications.text. Its body is the same key plus _BODY. */
  textKey: string;
  params?: NotificationParams;
  link?: string;
  /** The same key is never sent twice to the same person. */
  dedupeKey?: string;
  /** Also email these people. Sent later, from the returned queue. */
  email?: boolean;
};

/** Returns emails to send once the transaction has committed. */
export async function notify(tx: Tx, input: NotifyInput): Promise<QueuedEmail[]> {
  const params = input.params ?? {};
  const title = encodeText(input.textKey, params);
  const body = encodeText(`${input.textKey}_BODY`, params);
  const queue: QueuedEmail[] = [];

  for (const userId of input.userIds) {
    const dedupeKey = input.dedupeKey ? `${input.dedupeKey}:${userId}` : null;
    if (dedupeKey && (await tx.notification.findUnique({ where: { dedupeKey }, select: { id: true } }))) continue;
    const created = await tx.notification.create({
      data: {
        userId,
        fdrId: input.fdrId,
        kind: input.kind,
        channel: input.email ? "EMAIL" : "IN_APP",
        title,
        body,
        link: input.link,
        dedupeKey,
        emailStatus: input.email ? "PENDING" : "NOT_APPLICABLE",
      },
      include: { user: { select: { email: true } } },
    });
    if (input.email) queue.push({ notificationId: created.id, to: created.user.email, title, body });
  }
  return queue;
}

export async function activeUsersWithRole(tx: Tx, role: Role): Promise<string[]> {
  const users = await tx.user.findMany({ where: { role, status: "ACTIVE" }, select: { id: true } });
  return users.map((user) => user.id);
}

export async function institutionUsers(tx: Tx, institutionId: string): Promise<string[]> {
  const users = await tx.user.findMany({ where: { institutionId, status: "ACTIVE" }, select: { id: true } });
  return users.map((user) => user.id);
}

/** In-app note to the institution that owns an FDR. Scoped by FDR, so it can't reach anyone else. */
export async function notifyInstitution(tx: Tx, fdrId: string, kind: NotificationKind, textKey = "DISCREPANCY") {
  const fdr = await tx.fdr.findUniqueOrThrow({ where: { id: fdrId }, select: { institutionId: true, referenceNo: true } });
  await notify(tx, {
    userIds: await institutionUsers(tx, fdr.institutionId),
    fdrId,
    kind,
    textKey,
    params: { reference: fdr.referenceNo },
    link: `/fdrs/${fdrId}`,
  });
}
