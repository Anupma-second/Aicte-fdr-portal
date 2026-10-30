import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

export function Footer() {
  const t = useTranslations("landing.footer");
  const tNav = useTranslations("landing.nav");
  const tApp = useTranslations("app");
  return (
    <footer id="contact" className="scroll-mt-20 bg-navy px-4 py-12 text-white sm:px-6">
      <div className="mx-auto grid max-w-7xl gap-8 md:grid-cols-[2fr_1fr_1fr]">
        <div>
          <p className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="size-6 text-gold" aria-hidden />
            {tApp("name")}
          </p>
          <p className="mt-3 max-w-md text-sm text-white/75">{t("about")}</p>
        </div>
        <div>
          <h2 className="text-sm font-semibold">{t("linksTitle")}</h2>
          <ul className="mt-3 space-y-2 text-sm text-white/75">
            <li><a href="#features" className="hover:text-white">{tNav("features")}</a></li>
            <li><a href="#track" className="hover:text-white">{tNav("track")}</a></li>
            <li><Link href="/login" className="hover:text-white">{tNav("login")}</Link></li>
            <li><Link href="/register" className="hover:text-white">{tNav("register")}</Link></li>
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-semibold">{t("contactTitle")}</h2>
          <p className="mt-3 text-sm text-white/75">{t("contactText")}</p>
          <a href="mailto:support@example.test" className="mt-2 inline-block text-sm text-gold hover:underline">support@example.test</a>
        </div>
      </div>
      <p className="mx-auto mt-10 max-w-7xl border-t border-white/15 pt-6 text-xs text-white/60">{t("disclaimer")}</p>
    </footer>
  );
}
