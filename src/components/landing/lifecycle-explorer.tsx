"use client";

import type { FdrStatus, TrustLevel } from "@prisma/client";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { StatusChip } from "@/components/fdr/status-chip";
import { TrustBadge } from "@/components/fdr/trust-badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { SectionHeading } from "./section-heading";

const STEPS: { status: FdrStatus; trust: TrustLevel; daysLeft: string; event: string }[] = [
  { status: "SUBMITTED", trust: "SELF_DECLARED", daysLeft: "730", event: "submitted" },
  { status: "VERIFIED", trust: "DOCUMENT_VERIFIED", daysLeft: "722", event: "verified" },
  { status: "ACTIVE", trust: "BANK_CONFIRMED", daysLeft: "720", event: "confirmed" },
  { status: "EXPIRING", trust: "BANK_CONFIRMED", daysLeft: "60", event: "alert" },
  { status: "RENEWED", trust: "BANK_CONFIRMED", daysLeft: "0", event: "renewed" },
  { status: "RELEASED", trust: "BANK_CONFIRMED", daysLeft: "0", event: "released" },
];

export function LifecycleExplorer() {
  const t = useTranslations("landing.lifecycle");
  const tStatus = useTranslations("status");
  const reduced = useReducedMotion();
  const [active, setActive] = useState(0);
  const step = STEPS[active];

  return (
    <section id="lifecycle" className="bg-dots scroll-mt-20 px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <SectionHeading eyebrow={t("eyebrow")} title={t("title")} subtitle={t("subtitle")} />

        <ol className="mb-8 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {STEPS.map((item, index) => (
            <li key={item.status}>
              <button
                type="button"
                onClick={() => setActive(index)}
                aria-current={index === active ? "step" : undefined}
                className={cn(
                  "flex w-full cursor-pointer flex-col items-center gap-1.5 rounded-xl border p-3 text-center text-xs font-medium transition-colors sm:text-sm",
                  index === active ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
                )}
              >
                <span className="flex size-6 items-center justify-center rounded-full bg-secondary text-xs text-secondary-foreground">
                  {index < active ? <Check className="size-3.5" aria-hidden /> : index + 1}
                </span>
                {tStatus(item.status)}
              </button>
            </li>
          ))}
        </ol>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="p-6">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={step.status}
                initial={reduced ? false : { opacity: 0, rotateX: -12, y: 10 }}
                animate={{ opacity: 1, rotateX: 0, y: 0 }}
                exit={reduced ? undefined : { opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs text-muted-foreground">{t("demoLabel")}</p>
                    <p className="text-lg font-semibold tabular-nums">FDR-2026-000123</p>
                  </div>
                  <StatusChip status={step.status} />
                </div>
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted px-4 py-3">
                  <TrustBadge level={step.trust} />
                  <p className="text-sm font-medium tabular-nums">
                    {step.daysLeft === "0" ? t("noCountdown") : t("daysLeft", { days: step.daysLeft })}
                  </p>
                </div>
                <p className="mt-5 text-sm text-pretty" aria-live="polite">{t(`explain.${step.event}`)}</p>
              </motion.div>
            </AnimatePresence>
          </Card>

          <Card className="p-6">
            <h3 className="font-semibold">{t("timelineTitle")}</h3>
            <ol className="mt-4 space-y-0">
              {STEPS.slice(0, active + 1).map((item, index) => (
                <motion.li
                  key={item.event}
                  initial={reduced ? false : { opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="relative flex gap-3 pb-4 last:pb-0"
                >
                  {index < active && <span className="absolute top-5 left-[7px] h-full w-0.5 bg-border" aria-hidden />}
                  <span className={cn("relative mt-1 size-4 shrink-0 rounded-full border-2 border-card", index === active ? "bg-gold" : "bg-primary")} aria-hidden />
                  <div>
                    <p className="text-sm font-medium">{t(`events.${item.event}`)}</p>
                    <p className="text-xs text-muted-foreground">{t(`actors.${item.event}`)}</p>
                  </div>
                </motion.li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </section>
  );
}
