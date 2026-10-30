"use client";

import { Languages } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function LocaleToggle({ className }: { className?: string }) {
  const locale = useLocale();
  const t = useTranslations("shell");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const next = locale === "en" ? "hi" : "en";

  async function toggle() {
    const response = await fetch("/api/locale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale: next }),
    });
    if (!response.ok) {
      toast.error(t("languageFailed"));
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <Button variant="ghost" onClick={toggle} disabled={pending} aria-label={t("switchLanguage")} className={cn("px-2 sm:px-3", className)}>
      <Languages />
      <span lang={next}>{next === "hi" ? "हिन्दी" : "English"}</span>
    </Button>
  );
}
