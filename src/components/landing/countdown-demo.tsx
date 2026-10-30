"use client";

import { Bell, BellRing, Building2, ShieldAlert, UserCheck, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { computeRisk } from "@/lib/fdr/risk";
import { cn } from "@/lib/utils";
import { SectionHeading } from "./section-heading";

const MIN_DAYS = -30;
const MAX_DAYS = 120;

// Same defaults as the seeded alert rules, which an admin can change.
const LADDER: { key: string; firesAt: number; icon: LucideIcon }[] = [
  { key: "reminder90", firesAt: 90, icon: Bell },
  { key: "reminder60", firesAt: 60, icon: Bell },
  { key: "reminder30", firesAt: 30, icon: Bell },
  { key: "reminder7", firesAt: 7, icon: BellRing },
  { key: "institution", firesAt: -1, icon: Building2 },
  { key: "officer", firesAt: -7, icon: UserCheck },
  { key: "authority", firesAt: -15, icon: ShieldAlert },
];

const RISK_STYLES = {
  GREEN: { bar: "bg-status-green", chip: "bg-status-green-bg text-status-green" },
  AMBER: { bar: "bg-status-amber", chip: "bg-status-amber-bg text-status-amber" },
  RED: { bar: "bg-status-red", chip: "bg-status-red-bg text-status-red" },
};

export function CountdownDemo() {
  const t = useTranslations("landing.countdown");
  const tRisk = useTranslations("risk");
  const [days, setDays] = useState(45);

  // The real scoring function, so this demo can't drift from the product.
  const risk = computeRisk({
    status: "ACTIVE",
    daysToMaturity: days,
    missingDocuments: 0,
    pastDelays: 0,
    openDiscrepancies: 0,
    resolvedDiscrepancies: 0,
  });
  const styles = RISK_STYLES[risk.level];

  return (
    <section className="bg-dots px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <SectionHeading eyebrow={t("eyebrow")} title={t("title")} subtitle={t("subtitle")} />
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="p-6">
            <label htmlFor="days-slider" className="text-sm font-medium">{t("sliderLabel")}</label>
            <p className="mt-2 text-4xl font-semibold tabular-nums">
              {days < 0 ? t("overdue", { days: -days }) : t("left", { days })}
            </p>
            <input
              id="days-slider"
              type="range"
              min={MIN_DAYS}
              max={MAX_DAYS}
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
              className="mt-5 h-2 w-full cursor-pointer accent-primary"
            />
            <div className="mt-1 flex justify-between text-xs text-muted-foreground">
              <span>{t("overdue", { days: -MIN_DAYS })}</span>
              <span>{t("left", { days: MAX_DAYS })}</span>
            </div>

            <div className="mt-8 flex items-center justify-between gap-3">
              <p className="text-sm font-medium">{t("riskLabel")}</p>
              <span className={cn("rounded-full px-3 py-1 text-sm font-semibold", styles.chip)}>
                {tRisk(risk.level)} · {risk.score}
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
              <div className={cn("h-full rounded-full transition-all duration-300", styles.bar)} style={{ width: `${risk.score}%` }} />
            </div>
            <p className="mt-3 text-sm text-muted-foreground" aria-live="polite">
              {risk.reasons.length === 0
                ? tRisk("noReasons")
                : risk.reasons.map((reason) => tRisk(`reason.${reason.code}`, { value: reason.value })).join(", ")}
            </p>
          </Card>

          <Card className="p-6">
            <h3 className="font-semibold">{t("ladderTitle")}</h3>
            <ol className="mt-4 space-y-2">
              {LADDER.map((rung) => {
                const fired = days <= rung.firesAt;
                const Icon = rung.icon;
                return (
                  <li
                    key={rung.key}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors",
                      fired ? "border-gold bg-accent text-accent-foreground" : "text-muted-foreground",
                    )}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden />
                    <span className="flex-1">{t(`ladder.${rung.key}`)}</span>
                    <span className="text-xs font-medium">{fired ? t("sent") : t("waiting")}</span>
                  </li>
                );
              })}
            </ol>
          </Card>
        </div>
      </div>
    </section>
  );
}
