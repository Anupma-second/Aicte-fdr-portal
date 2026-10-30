import type { FdrEvent, FdrEventType } from "@prisma/client";
import {
  BadgeCheck,
  Bell,
  CircleCheck,
  FileUp,
  Flag,
  GitBranch,
  HandCoins,
  MessageSquare,
  RefreshCw,
  ScanText,
  Send,
  ShieldAlert,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { renderText } from "@/lib/notifications/format";
import { formatDate } from "@/lib/utils";

const ICONS: Record<FdrEventType, LucideIcon> = {
  SUBMITTED: Send,
  DOCUMENT_UPLOADED: FileUp,
  OCR_RUN: ScanText,
  DISCREPANCY_RAISED: TriangleAlert,
  DISCREPANCY_RESOLVED: CircleCheck,
  OBSERVATION_ADDED: MessageSquare,
  BANK_VERIFICATION: BadgeCheck,
  VERIFIED: BadgeCheck,
  STATUS_CHANGED: RefreshCw,
  ALERT_SENT: Bell,
  ESCALATED: ShieldAlert,
  RENEWED: GitBranch,
  REPLACED: GitBranch,
  RELEASE_REQUESTED: HandCoins,
  RELEASE_DECISION: HandCoins,
  RELEASED: HandCoins,
  CLOSED: Flag,
};

type TimelineEvent = FdrEvent & { actor: { name: string } | null };

function timelineKey(event: TimelineEvent): string {
  const metadata = event.metadata as { documents?: boolean; reassigned?: boolean } | null;
  if (metadata?.documents) return "DOCUMENTS_CHECKED";
  if (metadata?.reassigned) return "REASSIGNED";
  return event.type;
}

export function FdrTimeline({ events }: { events: TimelineEvent[] }) {
  const t = useTranslations("fdr.timeline");
  const tText = useTranslations("notifications.text");
  const locale = useLocale();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <ol>
          {events.map((event, index) => {
            const Icon = ICONS[event.type];
            return (
              <li key={event.id} className="relative flex gap-3 pb-5 last:pb-0">
                {index < events.length - 1 && <span className="absolute top-8 bottom-0 left-4 w-0.5 -translate-x-1/2 bg-border" aria-hidden />}
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
                  <Icon className="size-4" aria-hidden />
                </span>
                <div className="min-w-0 pt-0.5">
                  <p className="text-sm font-medium">{t(`events.${timelineKey(event)}`)}</p>
                  {event.detail && <p className="mt-0.5 text-sm break-words text-muted-foreground">{renderText(event.detail, tText)}</p>}
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {event.actor?.name ?? t("system")} · {formatDate(event.occurredAt, locale)}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
