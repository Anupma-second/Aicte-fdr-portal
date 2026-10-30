import { ArrowLeft, BadgeCheck, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { LocaleToggle } from "@/components/shell/locale-toggle";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { optionalPhoto } from "@/lib/landing";

const POINTS = ["one", "two", "three"] as const;

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("auth.panel");
  const tApp = useTranslations("app");
  const photo = optionalPhoto("auth.jpg");

  return (
    <div className="bg-mesh grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <aside className="sticky top-0 isolate hidden h-dvh flex-col justify-between overflow-hidden p-10 text-white lg:flex">
        <div className="hero-mesh -z-10" aria-hidden />
        {photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" className="absolute inset-0 -z-10 size-full object-cover opacity-20 mix-blend-luminosity" />
        )}
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <ShieldCheck className="size-7 text-gold" aria-hidden />
          {tApp("shortName")}
        </Link>
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/campus.svg" alt="" className="mb-8 w-full max-w-md" />
          <h2 className="text-3xl font-semibold tracking-tight text-balance">{t("title")}</h2>
          <ul className="mt-5 space-y-3 text-sm text-white/85">
            {POINTS.map((point) => (
              <li key={point} className="flex gap-2">
                <BadgeCheck className="size-5 shrink-0 text-gold" aria-hidden />
                {t(point)}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-white/60">{tApp("bureau")}</p>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="flex items-center justify-between gap-2 p-4 sm:px-6">
          <Link href="/" className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" aria-hidden />
            {t("back")}
          </Link>
          <div className="flex items-center gap-1">
            <LocaleToggle />
            <ThemeToggle />
          </div>
        </header>
        <main className="flex flex-1 items-center justify-center px-4 pb-10 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
