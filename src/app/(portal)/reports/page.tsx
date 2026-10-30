import { CalendarClock, ClipboardList, FileSpreadsheet, FileText, FileWarning, Map, TimerOff, type LucideIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requirePageRole } from "@/lib/auth/guards";
import { REPORT_TYPES, getReport, type ReportType } from "@/lib/reports/data";

const ICONS: Record<ReportType, LucideIcon> = {
  pending: ClipboardList,
  upcoming: CalendarClock,
  missing: FileWarning,
  overdue: TimerOff,
  region: Map,
};

export default async function ReportsPage() {
  await requirePageRole("SCRUTINY_OFFICER", "COMPETENT_AUTHORITY", "ADMIN");
  const t = await getTranslations("reports");
  const reports = await Promise.all(REPORT_TYPES.map((type) => getReport(type)));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("hint")}</p>
      </div>
      <ul className="grid gap-4 md:grid-cols-2">
        {reports.map((report) => {
          const Icon = ICONS[report.type];
          return (
            <li key={report.type}>
              <Card className="flex h-full flex-col gap-4 p-5">
                <div className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <h2 className="font-semibold">{t(`types.${report.type}.title`)}</h2>
                    <p className="text-sm text-muted-foreground">{t(`types.${report.type}.text`)}</p>
                    <p className="mt-1 text-sm font-medium tabular-nums">{t("rows", { count: report.rows.length })}</p>
                  </div>
                </div>
                <div className="mt-auto flex flex-wrap gap-2">
                  <Button asChild variant="outline" size="sm">
                    <a href={`/api/reports/${report.type}?format=xlsx`} download aria-label={`${t("excel")}: ${t(`types.${report.type}.title`)}`}>
                      <FileSpreadsheet />
                      {t("excel")}
                    </a>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <a href={`/api/reports/${report.type}?format=pdf`} download aria-label={`${t("pdf")}: ${t(`types.${report.type}.title`)}`}>
                      <FileText />
                      {t("pdf")}
                    </a>
                  </Button>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">{t("languageNote")}</p>
    </div>
  );
}
