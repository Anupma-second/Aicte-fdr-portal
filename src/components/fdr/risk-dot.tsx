"use client";

import type { RiskLevel } from "@prisma/client";
import { useTranslations } from "next-intl";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { RiskReason } from "@/lib/fdr/risk";
import { cn } from "@/lib/utils";

const DOT: Record<RiskLevel, string> = {
  GREEN: "bg-status-green",
  AMBER: "bg-status-amber",
  RED: "bg-status-red",
};

/** Colour is never the only signal: the level is in the label and the tooltip explains why. */
export function RiskDot({ level, score, reasons }: { level: RiskLevel; score: number; reasons: RiskReason[] }) {
  const t = useTranslations("risk");
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger className="inline-flex cursor-help items-center gap-1.5 rounded text-xs font-medium">
          <span className={cn("size-2.5 rounded-full", DOT[level])} aria-hidden />
          {t(level)} · {score}
        </TooltipTrigger>
        <TooltipContent>
          {reasons.length === 0 ? (
            <p>{t("noReasons")}</p>
          ) : (
            <ul className="space-y-1">
              {reasons.map((reason) => (
                <li key={reason.code} className="flex justify-between gap-4">
                  <span>{t(`reason.${reason.code}`, { value: reason.value })}</span>
                  <span className="font-medium tabular-nums">+{reason.points}</span>
                </li>
              ))}
            </ul>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
