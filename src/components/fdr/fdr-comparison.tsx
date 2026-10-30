import type { BankVerificationLog, Fdr, OcrExtraction } from "@prisma/client";
import { TriangleAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isoDate, sameAmount, sameBank, sameText } from "@/lib/fdr/compare";
import { cn, formatDate, formatInr } from "@/lib/utils";

type Row = {
  key: string;
  declared: string;
  document: string | null;
  bank: string | null;
  documentMatches: boolean | null;
  bankMatches: boolean | null;
};

/** Keeps the three sources visibly apart: what was submitted, what the document says, what the bank confirmed. */
export function FdrComparison({
  fdr,
  ocr,
  bank,
}: {
  fdr: Fdr;
  ocr: OcrExtraction | null;
  bank: BankVerificationLog | null;
}) {
  const t = useTranslations("fdr.compare");
  const tFields = useTranslations("fdr.fields");
  const locale = useLocale();
  const read = ocr?.status === "COMPLETED" ? ocr : null;

  const rows: Row[] = [
    {
      key: "fdrNumber",
      declared: fdr.fdrNumber,
      document: read?.fdrNumber ?? null,
      bank: null,
      documentMatches: read?.fdrNumber ? sameText(read.fdrNumber, fdr.fdrNumber) : null,
      bankMatches: null,
    },
    {
      key: "amount",
      declared: formatInr(fdr.amount, locale),
      document: read?.amount ? formatInr(read.amount, locale) : null,
      bank: bank?.confirmedAmount ? formatInr(bank.confirmedAmount, locale) : null,
      documentMatches: read?.amount ? sameAmount(read.amount, fdr.amount) : null,
      bankMatches: bank?.confirmedAmount ? sameAmount(bank.confirmedAmount, fdr.amount) : null,
    },
    {
      key: "bankName",
      declared: fdr.bankName,
      document: read?.bankName ?? null,
      bank: null,
      documentMatches: read?.bankName ? sameBank(read.bankName, fdr.bankName) : null,
      bankMatches: null,
    },
    {
      key: "branchName",
      declared: fdr.branchName,
      document: read?.branchName ?? null,
      bank: null,
      documentMatches: read?.branchName ? sameText(read.branchName, fdr.branchName) : null,
      bankMatches: null,
    },
    {
      key: "issueDate",
      declared: formatDate(fdr.issueDate, locale),
      document: read?.issueDate ? formatDate(read.issueDate, locale) : null,
      bank: null,
      documentMatches: read?.issueDate ? isoDate(read.issueDate) === isoDate(fdr.issueDate) : null,
      bankMatches: null,
    },
    {
      key: "maturityDate",
      declared: formatDate(fdr.maturityDate, locale),
      document: read?.maturityDate ? formatDate(read.maturityDate, locale) : null,
      bank: bank?.confirmedMaturityDate ? formatDate(bank.confirmedMaturityDate, locale) : null,
      documentMatches: read?.maturityDate ? isoDate(read.maturityDate) === isoDate(fdr.maturityDate) : null,
      bankMatches: bank?.confirmedMaturityDate ? isoDate(bank.confirmedMaturityDate) === isoDate(fdr.maturityDate) : null,
    },
  ];

  function cell(value: string | null, matches: boolean | null) {
    if (value === null) return <span className="text-muted-foreground">{t("notAvailable")}</span>;
    if (matches !== false) return value;
    return (
      <span className="inline-flex items-center gap-1.5 rounded bg-status-red-bg px-1.5 py-0.5 font-medium text-status-red">
        <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
        {value}
        <span className="sr-only">{t("mismatch")}</span>
      </span>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("hint")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                <th scope="col" className="py-2 pr-4 font-medium">{t("field")}</th>
                <th scope="col" className="py-2 pr-4 font-medium">{t("submitted")}</th>
                <th scope="col" className={cn("py-2 pr-4 font-medium")}>
                  {t("document")}
                  {read?.confidence != null && <span className="ml-1 font-normal">({Math.round(read.confidence * 100)}%)</span>}
                </th>
                <th scope="col" className="py-2 font-medium">{t("bank")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-b last:border-0">
                  <th scope="row" className="py-2.5 pr-4 font-medium whitespace-nowrap">{tFields(row.key)}</th>
                  <td className="py-2.5 pr-4">{row.declared}</td>
                  <td className="py-2.5 pr-4">{cell(row.document, row.documentMatches)}</td>
                  <td className="py-2.5">{cell(row.bank, row.bankMatches)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {ocr?.status === "FAILED" && <p className="mt-3 text-sm text-status-amber">{t("ocrFailed")}</p>}
        {bank && <p className="mt-3 text-xs text-muted-foreground">{t("simulated")}</p>}
      </CardContent>
    </Card>
  );
}
