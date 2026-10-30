import { getTranslations } from "next-intl/server";
import { FdrForm } from "@/components/fdr/fdr-form";
import { requirePageRole } from "@/lib/auth/guards";

export default async function NewFdrPage() {
  await requirePageRole("INSTITUTION");
  const t = await getTranslations("fdr.form");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("newTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("newHint")}</p>
      </div>
      <FdrForm mode="new" />
    </div>
  );
}
