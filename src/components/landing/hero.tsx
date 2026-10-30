"use client";

import { animate, motion, useMotionValue, useReducedMotion, useSpring, useTransform, type MotionValue } from "framer-motion";
import { ArrowRight, BadgeCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { LandingData } from "@/lib/landing";

function Counter({ value, label }: { value: number; label: string }) {
  const locale = useLocale();
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (reduced) {
      setShown(value);
      return;
    }
    const controls = animate(0, value, { duration: 1.6, ease: "easeOut", onUpdate: (latest) => setShown(Math.round(latest)) });
    return () => controls.stop();
  }, [value, reduced]);

  return (
    <div>
      <p className="text-2xl font-semibold tabular-nums sm:text-3xl">{shown.toLocaleString(locale === "hi" ? "hi-IN" : "en-IN")}</p>
      <p className="mt-0.5 text-xs text-white/70 sm:text-sm">{label}</p>
    </div>
  );
}

type FloatingProps = {
  x: MotionValue<number>;
  y: MotionValue<number>;
  depth: number;
  className: string;
  children: React.ReactNode;
};

/** Moves and tilts with the pointer. Deeper cards move further, which creates the parallax. */
function Floating({ x, y, depth, className, children }: FloatingProps) {
  const translateX = useTransform(x, [-1, 1], [-depth, depth]);
  const translateY = useTransform(y, [-1, 1], [-depth, depth]);
  const rotateY = useTransform(x, [-1, 1], [-depth / 3, depth / 3]);
  const rotateX = useTransform(y, [-1, 1], [depth / 3, -depth / 3]);
  return (
    <motion.div
      style={{ x: translateX, y: translateY, rotateX, rotateY, transformPerspective: 800 }}
      className={`glass absolute rounded-2xl shadow-2xl ${className}`}
    >
      {children}
    </motion.div>
  );
}

export function Hero({ stats, photo }: { stats: LandingData["stats"] | null; photo: string | null }) {
  const t = useTranslations("landing.hero");
  const tStatus = useTranslations("status");
  const tTrust = useTranslations("trust");
  const reduced = useReducedMotion();
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const x = useSpring(rawX, { stiffness: 70, damping: 18 });
  const y = useSpring(rawY, { stiffness: 70, damping: 18 });
  const sectionRef = useRef<HTMLElement>(null);

  function handleMove(event: React.PointerEvent<HTMLElement>) {
    if (reduced || event.pointerType !== "mouse" || !sectionRef.current) return;
    const box = sectionRef.current.getBoundingClientRect();
    rawX.set(((event.clientX - box.left) / box.width) * 2 - 1);
    rawY.set(((event.clientY - box.top) / box.height) * 2 - 1);
  }

  return (
    <section
      ref={sectionRef}
      onPointerMove={handleMove}
      className="relative isolate overflow-hidden pt-16 text-white"
    >
      <div className="hero-mesh -z-10" aria-hidden />
      {photo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="" className="absolute inset-0 -z-10 size-full object-cover opacity-20 mix-blend-luminosity" />
      )}

      <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1.1fr_1fr] lg:py-24">
        <div>
          <p className="glass inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium sm:text-sm">
            <BadgeCheck className="size-4 text-gold" aria-hidden />
            {t("eyebrow")}
          </p>
          <h1 className="mt-5 text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">{t("title")}</h1>
          <p className="mt-5 max-w-xl text-base text-white/80 text-pretty sm:text-lg">{t("subtitle")}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild className="h-12 bg-gold px-6 text-navy hover:bg-gold/90">
              <a href="#track">
                {t("ctaTrack")}
                <ArrowRight />
              </a>
            </Button>
            <Button asChild variant="ghost" className="h-12 border border-white/30 px-6 text-white hover:bg-white/10">
              <a href="#lifecycle">{t("ctaExplore")}</a>
            </Button>
          </div>

          {stats && (
            <div className="mt-10">
              <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
                <Counter value={stats.fdrs} label={t("stats.fdrs")} />
                <Counter value={stats.institutions} label={t("stats.institutions")} />
                <Counter value={stats.alerts} label={t("stats.alerts")} />
                <Counter value={stats.hours} label={t("stats.hours")} />
              </div>
              <p className="mt-3 text-xs text-white/60">{t("stats.note")}</p>
            </div>
          )}
        </div>

        {/* Decorative: the same information is in the sections below. */}
        <div aria-hidden className="relative hidden h-[28rem] lg:block">
          <Floating x={x} y={y} depth={14} className="top-16 left-6 z-20 w-80 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-white/70">{t("card.reference")}</p>
                <p className="font-semibold tabular-nums">FDR-2026-000123</p>
              </div>
              <span className="rounded-full bg-status-green-bg px-2.5 py-0.5 text-xs font-medium text-status-green">{tStatus("ACTIVE")}</span>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-white/70">{t("card.amount")}</p>
                <p className="font-medium">₹ 10,00,000</p>
              </div>
              <div>
                <p className="text-xs text-white/70">{t("card.maturity")}</p>
                <p className="font-medium">{t("card.daysLeft")}</p>
              </div>
            </div>
            <p className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-gold">
              <BadgeCheck className="size-4" />
              {tTrust("BANK_CONFIRMED")}
            </p>
          </Floating>
          <Floating x={x} y={y} depth={32} className="top-0 right-4 z-10 p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/shield.svg" alt="" className="size-24" />
          </Floating>
          <Floating x={x} y={y} depth={24} className="right-0 bottom-20 z-30 p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/calendar.svg" alt="" className="size-28" />
          </Floating>
          <Floating x={x} y={y} depth={40} className="bottom-2 left-20 z-10 p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/chart.svg" alt="" className="size-28" />
          </Floating>
        </div>
      </div>
    </section>
  );
}
