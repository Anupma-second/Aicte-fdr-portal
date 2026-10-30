import { FileSearch } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default async function NotFound() {
  const t = await getTranslations("notFound");
  return (
    <main className="bg-mesh flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-md pb-6 text-center">
        <EmptyState isPageTitle icon={FileSearch} title={t("title")} description={t("description")} />
        <Button asChild>
          <Link href="/">{t("home")}</Link>
        </Button>
      </Card>
    </main>
  );
}
