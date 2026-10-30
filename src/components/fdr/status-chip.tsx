import type { FdrStatus } from "@prisma/client";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

const STYLES: Record<FdrStatus, string> = {
  SUBMITTED: "bg-status-blue-bg text-status-blue",
  UNDER_SCRUTINY: "bg-status-blue-bg text-status-blue",
  DISCREPANCY_RAISED: "bg-status-red-bg text-status-red",
  VERIFIED: "bg-status-green-bg text-status-green",
  ACTIVE: "bg-status-green-bg text-status-green",
  EXPIRING: "bg-status-amber-bg text-status-amber",
  MATURED: "bg-status-red-bg text-status-red",
  RENEWED: "bg-status-grey-bg text-status-grey",
  REPLACED: "bg-status-grey-bg text-status-grey",
  RELEASE_REQUESTED: "bg-status-amber-bg text-status-amber",
  RELEASED: "bg-status-grey-bg text-status-grey",
  CLOSED: "bg-status-grey-bg text-status-grey",
};

export function StatusChip({ status }: { status: FdrStatus }) {
  const t = useTranslations("status");
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", STYLES[status])}>
      {t(status)}
    </span>
  );
}
