"use client";

import { TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/** Keeps the sidebar and top bar on screen, so someone can move elsewhere. */
export default function PortalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("errorPage");

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Card className="pb-6 text-center">
      <EmptyState icon={TriangleAlert} title={t("title")} description={t("description")} />
      <Button onClick={reset}>{t("retry")}</Button>
    </Card>
  );
}
