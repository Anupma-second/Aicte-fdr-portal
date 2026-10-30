import { CircleCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { Reveal } from "@/components/common/reveal";

const POINTS = ["encryption", "hashChain", "rbac", "separation"] as const;

export function SecuritySection() {
  const t = useTranslations("landing.security");
  return (
    <section className="relative isolate overflow-hidden px-4 py-16 text-white sm:px-6 sm:py-24">
      <div className="hero-mesh -z-10" aria-hidden />
      <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[1fr_1.3fr]">
        <Reveal className="mx-auto">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/shield.svg" alt="" className="size-48 lg:size-72" />
        </Reveal>
        <Reveal delay={0.1}>
          <p className="text-sm font-semibold tracking-wide text-gold">{t("eyebrow")}</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{t("title")}</h2>
          <p className="mt-3 text-white/80 text-pretty">{t("subtitle")}</p>
          <ul className="mt-6 space-y-4">
            {POINTS.map((point) => (
              <li key={point} className="flex gap-3">
                <CircleCheck className="mt-0.5 size-5 shrink-0 text-gold" aria-hidden />
                <div>
                  <p className="font-medium">{t(`points.${point}.title`)}</p>
                  <p className="text-sm text-white/75">{t(`points.${point}.text`)}</p>
                </div>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
