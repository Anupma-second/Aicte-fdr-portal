import {
  BellRing,
  CalendarDays,
  ChartColumn,
  FileLock2,
  Gauge,
  GitBranch,
  History,
  Link2,
  ScanText,
  ScrollText,
  SearchCheck,
  Waypoints,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Reveal } from "@/components/common/reveal";
import { SectionHeading } from "./section-heading";

const ITEMS: { key: string; icon: LucideIcon }[] = [
  { key: "repository", icon: FileLock2 },
  { key: "trust", icon: SearchCheck },
  { key: "ocr", icon: ScanText },
  { key: "risk", icon: Gauge },
  { key: "alerts", icon: BellRing },
  { key: "timeline", icon: History },
  { key: "renewal", icon: GitBranch },
  { key: "release", icon: Waypoints },
  { key: "calendar", icon: CalendarDays },
  { key: "reports", icon: ChartColumn },
  { key: "audit", icon: ScrollText },
  { key: "bank", icon: Link2 },
];

export function Features() {
  const t = useTranslations("landing.features");
  return (
    <section id="features" className="scroll-mt-20 px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-7xl">
        <SectionHeading eyebrow={t("eyebrow")} title={t("title")} subtitle={t("subtitle")} />
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {ITEMS.map((item, index) => {
            const Icon = item.icon;
            return (
              <li key={item.key}>
                <Reveal delay={(index % 4) * 0.05} className="h-full">
                  <div className="group h-full rounded-xl border bg-card p-5 shadow-soft transition-all duration-200 hover:-translate-y-1 hover:border-primary/50">
                    <span className="flex size-11 items-center justify-center rounded-lg bg-secondary text-secondary-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <h3 className="mt-4 font-semibold">{t(`items.${item.key}.title`)}</h3>
                    <p className="mt-1.5 text-sm text-muted-foreground">{t(`items.${item.key}.text`)}</p>
                  </div>
                </Reveal>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
