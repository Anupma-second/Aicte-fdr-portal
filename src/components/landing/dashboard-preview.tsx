"use client";

import { motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, CalendarClock, ClipboardList, FileText, type LucideIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Reveal } from "@/components/common/reveal";
import { Card } from "@/components/ui/card";
import type { LandingData } from "@/lib/landing";
import { SectionHeading } from "./section-heading";

const ROW_KEYS = ["active", "pending", "expiring", "discrepancies", "matured", "finished"] as const;

function Tile({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-background/60 p-3">
      <Icon className="size-4 text-muted-foreground" aria-hidden />
      <p className="mt-2 text-xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

export function DashboardPreview({ overview, total }: { overview: LandingData["overview"]; total: number }) {
  const t = useTranslations("landing.preview");
  const locale = useLocale();
  const reduced = useReducedMotion();
  const format = (value: number) => value.toLocaleString(locale === "hi" ? "hi-IN" : "en-IN");
  const max = Math.max(...ROW_KEYS.map((key) => overview[key]), 1);

  return (
    <section className="bg-dots px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-5xl">
        <SectionHeading eyebrow={t("eyebrow")} title={t("title")} subtitle={t("subtitle")} />
        <Reveal>
          <Card className="overflow-hidden">
            <div className="flex items-center gap-1.5 border-b bg-muted px-4 py-3" aria-hidden>
              <span className="size-2.5 rounded-full bg-border" />
              <span className="size-2.5 rounded-full bg-border" />
              <span className="size-2.5 rounded-full bg-border" />
            </div>
            <div className="p-4 sm:p-6">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Tile icon={FileText} label={t("total")} value={format(total)} />
                <Tile icon={ClipboardList} label={t("rows.pending")} value={format(overview.pending)} />
                <Tile icon={CalendarClock} label={t("rows.expiring")} value={format(overview.expiring)} />
                <Tile icon={AlertTriangle} label={t("rows.discrepancies")} value={format(overview.discrepancies)} />
              </div>

              <h3 className="mt-6 text-sm font-semibold">{t("chartTitle")}</h3>
              <ul className="mt-3 space-y-2.5">
                {ROW_KEYS.map((key) => (
                  <li
                    key={key}
                    title={`${t(`rows.${key}`)}: ${format(overview[key])}`}
                    className="group grid grid-cols-[7.5rem_1fr_2.5rem] items-center gap-3 text-sm sm:grid-cols-[11rem_1fr_2.5rem]"
                  >
                    <span className="truncate text-muted-foreground">{t(`rows.${key}`)}</span>
                    <span className="h-3 rounded bg-muted">
                      <motion.span
                        className="block h-full origin-left rounded bg-primary transition-opacity group-hover:opacity-80"
                        style={{ width: `${(overview[key] / max) * 100}%` }}
                        initial={reduced ? false : { scaleX: 0 }}
                        whileInView={{ scaleX: 1 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                      />
                    </span>
                    <span className="text-right font-medium tabular-nums">{format(overview[key])}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-muted-foreground">{t("note")}</p>
            </div>
          </Card>
        </Reveal>
      </div>
    </section>
  );
}
