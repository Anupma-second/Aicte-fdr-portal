import { FdrStatus, RiskLevel, TrustLevel } from "@prisma/client";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, FileSearch, Plus } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/common/empty-state";
import { RiskDot } from "@/components/fdr/risk-dot";
import { StatusChip } from "@/components/fdr/status-chip";
import { TrustBadge } from "@/components/fdr/trust-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { requirePageRole } from "@/lib/auth/guards";
import { listFdrs, parseFdrListParams, type FdrListParams, type SortField } from "@/lib/fdr/queries";
import type { RiskReason } from "@/lib/fdr/risk";
import { formatDate, formatInr } from "@/lib/utils";

const SELECT_CLASS = "flex h-10 w-full rounded-lg border border-input bg-card px-3 text-sm";

function buildHref(params: FdrListParams, changes: Partial<FdrListParams>): string {
  const merged = { ...params, ...changes };
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(merged)) {
    if (value !== "" && !(key === "page" && value === 1)) query.set(key, String(value));
  }
  return `/fdrs?${query}`;
}

export default async function FdrListPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePageRole();
  const params = parseFdrListParams(await searchParams);
  const { rows, total, pages } = await listFdrs(user, params);
  const t = await getTranslations("fdr.list");
  const tTable = await getTranslations("fdrTable");
  const tStatus = await getTranslations("status");
  const tTrust = await getTranslations("trust");
  const tRisk = await getTranslations("risk");
  const locale = await getLocale();
  const isInstitution = user.role === "INSTITUTION";

  function sortHeader(field: SortField, label: string) {
    const active = params.sort === field;
    const nextDir = active && params.dir === "asc" ? "desc" : "asc";
    return (
      <th scope="col" aria-sort={active ? (params.dir === "asc" ? "ascending" : "descending") : "none"} className="sticky top-0 z-10 bg-card px-4 py-3 font-medium whitespace-nowrap">
        <Link href={buildHref(params, { sort: field, dir: nextDir, page: 1 })} className="inline-flex items-center gap-1 hover:text-foreground">
          {label}
          {active && (params.dir === "asc" ? <ArrowUp className="size-3.5" aria-hidden /> : <ArrowDown className="size-3.5" aria-hidden />)}
        </Link>
      </th>
    );
  }
  const plainHeader = (label: string) => (
    <th scope="col" className="sticky top-0 z-10 bg-card px-4 py-3 font-medium whitespace-nowrap">{label}</th>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t(isInstitution ? "titleOwn" : "titleAll")}</h1>
          <p className="text-sm text-muted-foreground">{t("count", { count: total })}</p>
        </div>
        {isInstitution && (
          <Button asChild>
            <Link href="/fdrs/new">
              <Plus />
              {t("new")}
            </Link>
          </Button>
        )}
      </div>

      <Card className="p-4">
        <form method="get" action="/fdrs" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr_1fr_auto_auto] xl:items-end">
          <div className="space-y-1">
            <label htmlFor="q" className="text-xs font-medium">{t("search")}</label>
            <Input id="q" name="q" type="search" defaultValue={params.q} placeholder={t(isInstitution ? "searchHintOwn" : "searchHintAll")} />
          </div>
          <div className="space-y-1">
            <label htmlFor="status" className="text-xs font-medium">{tTable("status")}</label>
            <select id="status" name="status" defaultValue={params.status} className={SELECT_CLASS}>
              <option value="">{t("all")}</option>
              {Object.values(FdrStatus).map((value) => <option key={value} value={value}>{tStatus(value)}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="trust" className="text-xs font-medium">{tTable("trust")}</label>
            <select id="trust" name="trust" defaultValue={params.trust} className={SELECT_CLASS}>
              <option value="">{t("all")}</option>
              {Object.values(TrustLevel).map((value) => <option key={value} value={value}>{tTrust(value)}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="risk" className="text-xs font-medium">{tTable("risk")}</label>
            <select id="risk" name="risk" defaultValue={params.risk} className={SELECT_CLASS}>
              <option value="">{t("all")}</option>
              {Object.values(RiskLevel).map((value) => <option key={value} value={value}>{tRisk(value)}</option>)}
            </select>
          </div>
          <input type="hidden" name="sort" value={params.sort} />
          <input type="hidden" name="dir" value={params.dir} />
          <Button type="submit">{t("apply")}</Button>
          <Button asChild variant="ghost">
            <Link href="/fdrs">{t("clear")}</Link>
          </Button>
        </form>
      </Card>

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState icon={FileSearch} title={t("emptyTitle")} description={t("emptyHint")} />
        ) : (
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  {sortHeader("referenceNo", tTable("reference"))}
                  {!isInstitution && plainHeader(tTable("institution"))}
                  {plainHeader(t("bank"))}
                  {sortHeader("amount", t("amount"))}
                  {sortHeader("maturityDate", tTable("maturity"))}
                  {sortHeader("status", tTable("status"))}
                  {plainHeader(tTable("trust"))}
                  {sortHeader("riskScore", tTable("risk"))}
                </tr>
              </thead>
              <tbody>
                {rows.map((fdr) => (
                  <tr key={fdr.id} className="border-t transition-colors hover:bg-muted/60">
                    <td className="px-4 py-3 font-medium whitespace-nowrap">
                      <Link href={`/fdrs/${fdr.id}`} className="text-primary underline-offset-4 hover:underline">{fdr.referenceNo}</Link>
                    </td>
                    {!isInstitution && <td className="max-w-52 truncate px-4 py-3">{fdr.institution.name}</td>}
                    <td className="max-w-40 truncate px-4 py-3">{fdr.bankName}</td>
                    <td className="px-4 py-3 whitespace-nowrap tabular-nums">{formatInr(fdr.amount, locale)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{formatDate(fdr.maturityDate, locale)}</td>
                    <td className="px-4 py-3"><StatusChip status={fdr.status} /></td>
                    <td className="px-4 py-3"><TrustBadge level={fdr.trustLevel} /></td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <RiskDot level={fdr.riskLevel} score={fdr.riskScore} reasons={(fdr.riskReasons ?? []) as unknown as RiskReason[]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {pages > 1 && (
        <nav aria-label={t("pagination")} className="flex items-center justify-between gap-3 text-sm">
          {params.page > 1 ? (
            <Button asChild variant="outline" size="sm">
              <Link href={buildHref(params, { page: params.page - 1 })}><ChevronLeft />{t("previous")}</Link>
            </Button>
          ) : <span />}
          <span className="text-muted-foreground">{t("page", { page: params.page, pages })}</span>
          {params.page < pages ? (
            <Button asChild variant="outline" size="sm">
              <Link href={buildHref(params, { page: params.page + 1 })}>{t("next")}<ChevronRight /></Link>
            </Button>
          ) : <span />}
        </nav>
      )}
    </div>
  );
}
