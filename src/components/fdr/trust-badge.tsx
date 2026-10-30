import type { TrustLevel } from "@prisma/client";
import { BadgeCheck, FileCheck2, PenLine, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

const STYLES: Record<TrustLevel, { icon: LucideIcon; className: string }> = {
  SELF_DECLARED: { icon: PenLine, className: "border-status-grey/40 text-status-grey" },
  DOCUMENT_VERIFIED: { icon: FileCheck2, className: "border-status-blue/40 text-status-blue" },
  BANK_CONFIRMED: { icon: BadgeCheck, className: "border-status-green/40 text-status-green" },
};

export function TrustBadge({ level }: { level: TrustLevel }) {
  const t = useTranslations("trust");
  const { icon: Icon, className } = STYLES[level];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap", className)}>
      <Icon className="size-3.5" aria-hidden />
      {t(level)}
    </span>
  );
}
