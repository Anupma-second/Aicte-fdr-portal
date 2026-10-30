import { Building2, Landmark, Settings2, UserSearch, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { SectionHeading } from "./section-heading";

const ROLES: { key: string; icon: LucideIcon }[] = [
  { key: "institution", icon: Building2 },
  { key: "officer", icon: UserSearch },
  { key: "authority", icon: Landmark },
  { key: "admin", icon: Settings2 },
];

const POINTS = ["one", "two", "three"] as const;

export function RoleCards() {
  const t = useTranslations("landing.roles");
  return (
    <section className="px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-7xl">
        <SectionHeading eyebrow={t("eyebrow")} title={t("title")} subtitle={t("subtitle")} />
        <ul className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {ROLES.map((role) => {
            const Icon = role.icon;
            return (
              // Expands on hover and keyboard focus. Touch screens have no hover, so it stays open there.
              <li
                key={role.key}
                tabIndex={0}
                className="group rounded-xl border bg-card p-5 shadow-soft transition-colors hover:border-primary/50 focus-visible:border-primary"
              >
                <Icon className="size-7 text-primary" aria-hidden />
                <h3 className="mt-3 font-semibold">{t(`items.${role.key}.title`)}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{t(`items.${role.key}.summary`)}</p>
                <div className="grid grid-rows-[0fr] transition-[grid-template-rows] duration-300 group-hover:grid-rows-[1fr] group-focus-visible:grid-rows-[1fr] [@media(hover:none)]:grid-rows-[1fr]">
                  <ul className="min-h-0 space-y-1.5 overflow-hidden text-sm">
                    {POINTS.map((point, index) => (
                      <li key={point} className={`flex gap-2 ${index === 0 ? "mt-3" : ""}`}>
                        <span className="mt-2 size-1.5 shrink-0 rounded-full bg-gold" aria-hidden />
                        {t(`items.${role.key}.${point}`)}
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
