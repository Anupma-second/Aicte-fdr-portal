"use client";

import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("errorPage");

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="bg-mesh flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-md pb-6 text-center">
        <EmptyState isPageTitle icon={TriangleAlert} title={t("title")} description={t("description")} />
        <div className="flex justify-center gap-2">
          <Button onClick={reset}>{t("retry")}</Button>
          <Button asChild variant="outline">
            <Link href="/">{t("home")}</Link>
          </Button>
        </div>
      </Card>
    </main>
  );
}
