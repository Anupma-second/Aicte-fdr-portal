"use client";

import { Menu, ShieldCheck, X } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { LocaleToggle } from "@/components/shell/locale-toggle";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { Button } from "@/components/ui/button";

const LINKS = [
  { href: "#features", key: "features" },
  { href: "#how", key: "how" },
  { href: "#track", key: "track" },
  { href: "#contact", key: "contact" },
] as const;

const ON_NAVY = "text-white hover:bg-white/10";

export function Navbar() {
  const t = useTranslations("landing.nav");
  const tApp = useTranslations("app");
  const [open, setOpen] = useState(false);

  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-white/10 bg-navy/90 text-white backdrop-blur-md">
      <nav aria-label={t("label")} className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 sm:px-6">
        <Link href="/" className="mr-auto flex min-w-0 items-center gap-2 font-semibold">
          <ShieldCheck className="size-7 shrink-0 text-gold" aria-hidden />
          <span className="truncate">{tApp("shortName")}</span>
        </Link>

        <ul className="mr-2 hidden items-center gap-1 lg:flex">
          {LINKS.map((link) => (
            <li key={link.key}>
              <a href={link.href} className="rounded-lg px-3 py-2 text-sm text-white/85 transition-colors hover:bg-white/10 hover:text-white">
                {t(link.key)}
              </a>
            </li>
          ))}
        </ul>

        <LocaleToggle className={ON_NAVY} />
        <ThemeToggle className={ON_NAVY} />

        <div className="hidden items-center gap-2 sm:flex">
          <Button asChild variant="ghost" className={ON_NAVY}>
            <Link href="/login">{t("login")}</Link>
          </Button>
          <Button asChild className="bg-gold text-navy hover:bg-gold/90">
            <Link href="/register">{t("register")}</Link>
          </Button>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className={`${ON_NAVY} lg:hidden`}
          aria-label={t(open ? "closeMenu" : "openMenu")}
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          {open ? <X /> : <Menu />}
        </Button>
      </nav>

      {open && (
        <div className="border-t border-white/10 px-4 pb-4 lg:hidden">
          <ul className="py-2">
            {LINKS.map((link) => (
              <li key={link.key}>
                <a href={link.href} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-3 text-sm hover:bg-white/10">
                  {t(link.key)}
                </a>
              </li>
            ))}
          </ul>
          <div className="grid grid-cols-2 gap-2 sm:hidden">
            <Button asChild variant="ghost" className={`${ON_NAVY} border border-white/25`}>
              <Link href="/login">{t("login")}</Link>
            </Button>
            <Button asChild className="bg-gold text-navy hover:bg-gold/90">
              <Link href="/register">{t("register")}</Link>
            </Button>
          </div>
        </div>
      )}
    </header>
  );
}
