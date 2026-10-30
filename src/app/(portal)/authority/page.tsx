import { CheckSquare, CircleAlert, CircleCheck, Clock, FileText, Hourglass, IndianRupee, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { HorizontalBars, TrendLine } from "@/components/charts/charts";
import { ChartTable } from "@/components/charts/data-table";
import { EmptyState } from "@/components/common/empty-state";
import { StatCard } from "@/components/common/stat-card";
import { TrustBadge } from "@/components/fdr/trust-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePageRole } from "@/lib/auth/guards";
import { STATUS_GROUPS, getAuthorityDashboard, type StatusGroup } from "@/lib/dashboard/authority";
import { daysUntil } from "@/lib/fdr/dates";
import { formatDate, formatInr } from "@/lib/utils";

function compactInr(amount: number): string {
  if (amount >= 10_000_000) return `₹${Math.round(amount / 1_000_000) / 10} Cr`;
  if (amount >= 100_000) return `₹${Math.round(amount / 10_000) / 10} L`;
  return `₹${amount}`;
}

export default async function AuthorityDashboard() {
  await requirePageRole("COMPETENT_AUTHORITY");
  const t = await getTranslations("dashboards.authority");
  const tRegions = await getTranslations("regions");
  const locale = await getLocale();
  const now = new Date();
  const data = await getAuthorityDashboard(now);
  const monthFormat = new Intl.DateTimeFormat(locale === "hi" ? "hi-IN" : "en-IN", { month: "short", year: "2-digit", timeZone: "UTC" });

  const trend = data.trend.map((point) => ({ ...point, label: monthFormat.format(new Date(`${point.month}-01T00:00:00Z`)) }));
  const regionBars = data.regions.map((row) => ({ label: tRegions(row.region), value: row.amount, display: formatInr(row.amount, locale), axis: compactInr(row.amount) }));
  const stateBars = data.states.map((row) => ({ label: row.state, value: row.amount, display: formatInr(row.amount, locale), axis: compactInr(row.amount) }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t("totalFdrs")} value={data.total} icon={FileText} />
        <StatCard label={t("amountHeld")} value={formatInr(data.held, locale)} icon={IndianRupee} />
        <StatCard label={t("overdue")} value={data.overdueCount} icon={CircleAlert} />
        <StatCard label={t("awaitingApproval")} value={data.approvals.length} icon={CheckSquare} />
      </div>

      <section aria-labelledby="kpi-title">
        <h2 id="kpi-title" className="mb-3 text-sm font-semibold text-muted-foreground">{t("kpiTitle")}</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <StatCard label={t("kpiTurnaround")} value={data.kpis.averageDays === null ? "–" : t("kpiDays", { days: data.kpis.averageDays })} hint={t("kpiTurnaroundHint")} icon={Clock} />
          <StatCard label={t("kpiCaught")} value={data.kpis.caughtEarly} hint={t("kpiCaughtHint")} icon={ShieldCheck} />
          <StatCard label={t("kpiHours")} value={data.kpis.hoursSaved} hint={t("kpiHoursHint", { hours: data.kpis.hoursPerFdr })} icon={Hourglass} />
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>{t("byStatus")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {(Object.keys(STATUS_GROUPS) as StatusGroup[]).map((group) => (
              <li key={group} className="rounded-lg border bg-background/60 p-3">
                <p className="text-xl font-semibold tabular-nums">{data.groups[group]}</p>
                <p className="text-xs text-muted-foreground">{t(`groups.${group}`)}</p>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("approvalsTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {data.approvals.length === 0 ? (
            <EmptyState icon={CircleCheck} title={t("approvalsEmpty")} />
          ) : (
            <ul className="divide-y text-sm">
              {data.approvals.map((item) => (
                <li key={item.id}>
                  <Link href={`/fdrs/${item.fdr.id}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5">
                    <span className="font-medium text-primary tabular-nums">{item.fdr.referenceNo}</span>
                    <span className="min-w-0 flex-1 basis-40 truncate">{item.fdr.institution.name}</span>
                    <TrustBadge level={item.fdr.trustLevel} />
                    <span className="tabular-nums">{formatInr(item.fdr.amount, locale)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("regionTitle")}</CardTitle>
            <CardDescription>{t("regionHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <HorizontalBars data={regionBars} ariaLabel={t("regionTitle")} />
            <ChartTable headers={[t("region"), t("fdrCount"), t("amountHeld")]} rows={data.regions.map((row) => [tRegions(row.region), row.count, formatInr(row.amount, locale)])} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("stateTitle")}</CardTitle>
            <CardDescription>{t("stateHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <HorizontalBars data={stateBars} ariaLabel={t("stateTitle")} labelWidth={120} />
            <ChartTable headers={[t("state"), t("amountHeld")]} rows={data.states.map((row) => [row.state, formatInr(row.amount, locale)])} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("trendTitle")}</CardTitle>
          <CardDescription>{t("trendHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <TrendLine data={trend.map(({ label, days, cases }) => ({ label, days, cases }))} ariaLabel={t("trendTitle")} />
          <ChartTable headers={[t("month"), t("averageDays"), t("cases")]} rows={trend.map((point) => [point.label, point.days ?? "–", point.cases])} />
        </CardContent>
      </Card>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("overdueTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            {data.overdue.length === 0 ? (
              <EmptyState icon={CircleCheck} title={t("overdueEmpty")} />
            ) : (
              <ul className="divide-y text-sm">
                {data.overdue.map((fdr) => (
                  <li key={fdr.id}>
                    <Link href={`/fdrs/${fdr.id}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5">
                      <span className="font-medium text-primary tabular-nums">{fdr.referenceNo}</span>
                      <span className="min-w-0 flex-1 basis-32 truncate">{fdr.institution.name}</span>
                      <span className="text-status-red">{t("daysOverdue", { days: -daysUntil(fdr.maturityDate, now) })}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("escalatedTitle")}</CardTitle>
            <CardDescription>{t("escalatedHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            {data.escalated.length === 0 ? (
              <EmptyState icon={CircleCheck} title={t("escalatedEmpty")} />
            ) : (
              <ul className="divide-y text-sm">
                {data.escalated.map((item) => (
                  <li key={item.id}>
                    <Link href={`/fdrs/${item.fdr.id}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5">
                      <span className="font-medium text-primary tabular-nums">{item.fdr.referenceNo}</span>
                      <span className="min-w-0 flex-1 basis-32 truncate">{item.fdr.institution.name}</span>
                      <span className="text-muted-foreground">{formatDate(item.createdAt, locale)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
