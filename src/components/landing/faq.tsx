import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { SectionHeading } from "./section-heading";

const QUESTIONS = ["who", "trust", "bank", "documents", "tamper", "language"] as const;

export function Faq() {
  const t = useTranslations("landing.faq");
  return (
    <section className="px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-3xl">
        <SectionHeading eyebrow={t("eyebrow")} title={t("title")} subtitle={t("subtitle")} />
        <div className="space-y-3">
          {QUESTIONS.map((question) => (
            <details key={question} className="group rounded-xl border bg-card shadow-soft">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 font-medium [&::-webkit-details-marker]:hidden">
                {t(`items.${question}.q`)}
                <ChevronDown className="size-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <p className="px-4 pb-4 text-sm text-muted-foreground">{t(`items.${question}.a`)}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
