"use client";

import type { NotificationKind } from "@prisma/client";
import { Bell, CheckCheck, CircleDot, HandCoins, ShieldAlert, TriangleAlert, UserCheck, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { renderText } from "@/lib/notifications/format";
import { cn, formatDate } from "@/lib/utils";

const ICONS: Record<NotificationKind, LucideIcon> = {
  REMINDER: Bell,
  ESCALATION: ShieldAlert,
  DISCREPANCY: TriangleAlert,
  RELEASE: HandCoins,
  ACCOUNT: UserCheck,
  SYSTEM: CircleDot,
};

export type NotificationItem = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  createdAt: string;
};

export function NotificationList({ items, unread }: { items: NotificationItem[]; unread: number }) {
  const t = useTranslations("notifications");
  const tText = useTranslations("notifications.text");
  const locale = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function markAll() {
    setBusy(true);
    const response = await fetch("/api/notifications", { method: "POST" }).catch(() => null);
    setBusy(false);
    if (!response?.ok) {
      toast.error(t("failed"));
      return;
    }
    router.refresh();
  }

  function open(id: string) {
    // Fire and forget: following the link shouldn't wait for this.
    void fetch(`/api/notifications/${id}`, { method: "POST" }).then(() => router.refresh());
  }

  return (
    <div className="space-y-3">
      {unread > 0 && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void markAll()}>
            <CheckCheck />
            {t("markAll")}
          </Button>
        </div>
      )}
      <ul className="divide-y rounded-xl border bg-card shadow-soft">
        {items.map((item) => {
          const Icon = ICONS[item.kind];
          const content = (
            <>
              <span className={cn("mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full", item.read ? "bg-muted text-muted-foreground" : "bg-secondary text-secondary-foreground")}>
                <Icon className="size-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("block text-sm break-words", !item.read && "font-semibold")}>{renderText(item.title, tText)}</span>
                <span className="mt-0.5 block text-sm break-words text-muted-foreground">{renderText(item.body, tText)}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{formatDate(new Date(item.createdAt), locale)}</span>
              </span>
              {!item.read && (
                <span className="mt-2 size-2 shrink-0 rounded-full bg-gold">
                  <span className="sr-only">{t("unread")}</span>
                </span>
              )}
            </>
          );
          return (
            <li key={item.id}>
              {item.link ? (
                <Link href={item.link} onClick={() => open(item.id)} className="flex gap-3 p-4 transition-colors hover:bg-muted/60">{content}</Link>
              ) : (
                <div className="flex gap-3 p-4">{content}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
