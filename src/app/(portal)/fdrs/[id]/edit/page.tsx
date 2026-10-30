import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { FdrForm } from "@/components/fdr/fdr-form";
import { requirePageRole } from "@/lib/auth/guards";
import { isoDate } from "@/lib/fdr/compare";
import { getFdrDetail } from "@/lib/fdr/queries";
import { canEditFdr } from "@/lib/fdr/service";

export default async function EditFdrPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageRole("INSTITUTION");
  const { id } = await params;
  const fdr = await getFdrDetail(user, id);
  if (!canEditFdr(fdr.status)) redirect(`/fdrs/${id}`);
  const t = await getTranslations("fdr.form");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("editTitle", { reference: fdr.referenceNo })}</h1>
        <p className="text-sm text-muted-foreground">{t("editHint")}</p>
      </div>
      <FdrForm
        mode="edit"
        fdrId={id}
        initial={{
          fdrNumber: fdr.fdrNumber,
          bankName: fdr.bankName,
          branchName: fdr.branchName,
          ifscCode: fdr.ifscCode ?? "",
          amount: fdr.amount.toString(),
          issueDate: isoDate(fdr.issueDate),
          maturityDate: isoDate(fdr.maturityDate),
        }}
      />
    </div>
  );
}
