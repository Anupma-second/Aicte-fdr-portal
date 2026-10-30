import { AlertTriangle, ArrowRight, CircleCheck, ClipboardList, FileWarning, MessageSquareReply, Timer } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/common/empty-state";
import { StatCard } from "@/components/common/stat-card";
import { RiskDot } from "@/components/fdr/risk-dot";
import { StatusChip } from "@/components/fdr/status-chip";
import { TrustBadge } from "@/components/fdr/trust-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePageRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { daysUntil } from "@/lib/fdr/dates";
import type { RiskReason } from "@/lib/fdr/risk";
import { renderText } from "@/lib/notifications/format";
import { cn, formatDate } from "@/lib/utils";

const IN_PROGRESS = ["SUBMITTED", "UNDER_SCRUTINY", "DISCREPANCY_RAISED"] as const;
const SIDE_LIST_LIMIT = 6;

export default async function OfficerDashboard() {
  const user = await requirePageRole("SCRUTINY_OFFICER");
  const t = await getTranslations("dashboards.officer");
  const tTable = await getTranslations("fdrTable");
  const tTypes = await getTranslations("fdr.discrepancies.types");
  const tRelease = await getTranslations("fdr.releaseStatus");
  const tText = await getTranslations("notifications.text");
  const locale = await getLocale();
  const now = new Date();
  const missingScanWhere = {
    status: { in: [...IN_PROGRESS] },
    documents: { none: { type: "FDR_SCAN" as const, isCurrent: true } },
  };

  const [pending, discrepancies, missingCount, slaBreached, caseload, queue, responded, missing, releases] = await Promise.all([
    db.fdr.count({ where: { status: { in: ["SUBMITTED", "UNDER_SCRUTINY"] } } }),
    db.discrepancy.count({ where: { status: { in: ["OPEN", "RESPONDED"] } } }),
    db.fdr.count({ where: missingScanWhere }),
    db.fdr.count({ where: { status: { in: [...IN_PROGRESS] }, slaDueAt: { lt: now } } }),
    db.fdr.count({ where: { assignedOfficerId: user.id, status: { in: [...IN_PROGRESS] } } }),
    db.fdr.findMany({
      where: {
        status: { in: [...IN_PROGRESS, "VERIFIED", "EXPIRING", "MATURED"] },
        OR: [{ assignedOfficerId: user.id }, { assignedOfficerId: null }],
      },
      orderBy: [{ riskScore: "desc" }, { slaDueAt: "asc" }, { maturityDate: "asc" }],
      take: 12,
      include: { institution: { select: { name: true } } },
    }),
    db.discrepancy.findMany({
      where: { status: "RESPONDED" },
      orderBy: { respondedAt: "asc" },
      take: SIDE_LIST_LIMIT,
      include: { fdr: { select: { id: true, referenceNo: true } } },
    }),
    db.fdr.findMany({ where: missingScanWhere, orderBy: { submittedAt: "asc" }, take: SIDE_LIST_LIMIT, select: { id: true, referenceNo: true } }),
    db.releaseRequest.findMany({
      where: { status: { in: ["REQUESTED", "DOCUMENT_CHECK", "SCRUTINY", "APPROVED"] } },
      orderBy: { requestedAt: "asc" },
      take: SIDE_LIST_LIMIT,
      include: { fdr: { select: { id: true, referenceNo: true } } },
    }),
  ]);

  function sla(due: Date | null) {
    if (!due) return <span className="text-muted-foreground">{t("slaNone")}</span>;
    const days = daysUntil(due, now);
    return (
      <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", days < 0 ? "bg-status-red-bg text-status-red" : days <= 3 ? "bg-status-amber-bg text-status-amber" : "bg-status-grey-bg text-status-grey")}>
        {days < 0 ? t("slaOverdue", { days: -days }) : t("slaLeft", { days })}
      </span>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("caseload", { count: caseload })}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t("pending")} value={pending} icon={ClipboardList} />
        <StatCard label={t("discrepancies")} value={discrepancies} icon={AlertTriangle} />
        <StatCard label={t("missingDocs")} value={missingCount} icon={FileWarning} />
        <StatCard label={t("slaBreached")} value={slaBreached} icon={Timer} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("queueTitle")}</CardTitle>
          <CardDescription>{t("queueHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          {queue.length === 0 ? (
            <EmptyState icon={CircleCheck} title={t("queueEmpty")} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th className="py-2 pr-4 font-medium">{tTable("reference")}</th>
                    <th className="py-2 pr-4 font-medium">{tTable("institution")}</th>
                    <th className="py-2 pr-4 font-medium">{tTable("maturity")}</th>
                    <th className="py-2 pr-4 font-medium">{t("sla")}</th>
                    <th className="py-2 pr-4 font-medium">{tTable("status")}</th>
                    <th className="py-2 pr-4 font-medium">{tTable("trust")}</th>
                    <th className="py-2 font-medium">{tTable("risk")}</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.map((fdr) => (
                    <tr key={fdr.id} className="border-b last:border-0">
                      <td className="py-3 pr-4 font-medium whitespace-nowrap">
                        <Link href={`/fdrs/${fdr.id}`} className="text-primary underline-offset-4 hover:underline">{fdr.referenceNo}</Link>
                      </td>
                      <td className="max-w-52 truncate py-3 pr-4">{fdr.institution.name}</td>
                      <td className="py-3 pr-4 whitespace-nowrap">{formatDate(fdr.maturityDate, locale)}</td>
                      <td className="py-3 pr-4">{sla(fdr.slaDueAt)}</td>
                      <td className="py-3 pr-4"><StatusChip status={fdr.status} /></td>
                      <td className="py-3 pr-4"><TrustBadge level={fdr.trustLevel} /></td>
                      <td className="py-3 whitespace-nowrap">
                        <RiskDot level={fdr.riskLevel} score={fdr.riskScore} reasons={(fdr.riskReasons ?? []) as unknown as RiskReason[]} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("releasesTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {releases.length === 0 ? (
            <EmptyState icon={CircleCheck} title={t("releasesEmpty")} />
          ) : (
            <ul className="divide-y text-sm">
              {releases.map((release) => (
                <li key={release.id}>
                  <Link href={`/fdrs/${release.fdr.id}`} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="font-medium tabular-nums">{release.fdr.referenceNo}</span>
                    <span className="text-muted-foreground">{tRelease(release.status)}</span>
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
            <CardTitle>{t("respondedTitle")}</CardTitle>
            <CardDescription>{t("respondedHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            {responded.length === 0 ? (
              <EmptyState icon={MessageSquareReply} title={t("respondedEmpty")} />
            ) : (
              <ul className="divide-y text-sm">
                {responded.map((item) => (
                  <li key={item.id}>
                    <Link href={`/fdrs/${item.fdr.id}`} className="group flex items-center gap-3 py-2.5">
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium tabular-nums">{item.fdr.referenceNo}</span>
                        <span className="block truncate text-muted-foreground">{item.source === "OFFICER" ? renderText(item.message, tText) : tTypes(item.type)}</span>
                      </span>
                      <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("missingTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            {missing.length === 0 ? (
              <EmptyState icon={CircleCheck} title={t("missingEmpty")} />
            ) : (
              <ul className="divide-y text-sm">
                {missing.map((fdr) => (
                  <li key={fdr.id}>
                    <Link href={`/fdrs/${fdr.id}`} className="flex items-center justify-between gap-3 py-2.5 font-medium tabular-nums">
                      {fdr.referenceNo}
                      <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
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
