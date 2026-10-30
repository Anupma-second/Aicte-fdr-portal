import nodemailer from "nodemailer";
import en from "../../../messages/en.json";
import { getEnv } from "@/lib/env";
import { db } from "@/lib/db";
import { decodeText } from "./format";

export type QueuedEmail = { notificationId: string; to: string; title: string; body: string };

const TEXTS = en.notifications.text as Record<string, string>;

function toEnglish(value: string): string {
  const decoded = decodeText(value);
  if (!decoded) return value;
  return Object.entries(decoded.params).reduce(
    (text, [name, param]) => text.replaceAll(`{${name}}`, String(param)),
    TEXTS[decoded.key] ?? decoded.key,
  );
}

/** Sends after the database transaction commits. With no SMTP server set, emails go to the console. */
export async function deliverEmails(queue: QueuedEmail[]): Promise<void> {
  const env = getEnv();
  const transport = env.SMTP_HOST
    ? nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
      })
    : null;

  for (const email of queue) {
    const subject = toEnglish(email.title);
    const text = toEnglish(email.body);
    let status: "SENT" | "LOGGED" | "FAILED";
    if (transport) {
      try {
        await transport.sendMail({ from: env.SMTP_FROM, to: email.to, subject, text });
        status = "SENT";
      } catch (error) {
        console.error(`Email to ${email.to} failed`, error);
        status = "FAILED";
      }
    } else {
      console.log(`[email not sent: SMTP not configured] to=${email.to} subject="${subject}"`);
      status = "LOGGED";
    }
    await db.notification.update({ where: { id: email.notificationId }, data: { emailStatus: status } });
  }
}
