"use client";

import { motion, useReducedMotion } from "framer-motion";
import { BadgeCheck, BellRing, CircleCheckBig, Upload, UserSearch, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { SectionHeading } from "./section-heading";

const STEPS: { key: string; icon: LucideIcon }[] = [
  { key: "submit", icon: Upload },
  { key: "scrutinise", icon: UserSearch },
  { key: "confirm", icon: BadgeCheck },
  { key: "monitor", icon: BellRing },
  { key: "close", icon: CircleCheckBig },
];

export function HowItWorks() {
  const t = useTranslations("landing.how");
  const reduced = useReducedMotion();

  return (
    <section id="how" className="bg-dots scroll-mt-20 px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <SectionHeading eyebrow={t("eyebrow")} title={t("title")} subtitle={t("subtitle")} />
        <div className="relative">
          {/* The line draws itself across the steps. Desktop only; on phones the order is plain from the list. */}
          <motion.div
            aria-hidden
            className="absolute top-7 right-[10%] left-[10%] hidden h-0.5 origin-left bg-gold md:block"
            initial={reduced ? false : { scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 1.4, ease: "easeInOut" }}
          />
          <ol className="relative grid gap-6 md:grid-cols-5">
            {STEPS.map((step, index) => {
              const Icon = step.icon;
              return (
                <motion.li
                  key={step.key}
                  initial={reduced ? false : { opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-80px" }}
                  transition={{ duration: 0.4, delay: index * 0.22 }}
                  className="flex gap-4 md:flex-col md:items-center md:text-center"
                >
                  <span className="relative flex size-14 shrink-0 items-center justify-center rounded-full border-4 border-background bg-primary text-primary-foreground">
                    <Icon className="size-6" aria-hidden />
                  </span>
                  <div>
                    <h3 className="font-semibold">{t(`steps.${step.key}.title`)}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{t(`steps.${step.key}.text`)}</p>
                  </div>
                </motion.li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}
