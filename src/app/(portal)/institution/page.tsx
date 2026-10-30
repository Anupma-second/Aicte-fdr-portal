import { AlertTriangle, ArrowRight, Bell, CalendarClock, CircleCheck, CircleDashed, FileText, FileWarning, IndianRupee, Plus } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/common/empty-state";
import { StatCard } from "@/components/common/stat-card";
import { StatusChip } from "@/components/fdr/status-chip";
import { TrustBadge } from "@/components/fdr/trust-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePageRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { addDays, daysUntil } from "@/lib/fdr/dates";
import { renderText } from "@/lib/notifications/format";
import { formatDate, formatInr } from "@/lib/utils";

const FINISHED = ["RENEWED", "REPLACED", "RELEASED", "CLOSED"] as const;
const ACTION_LIMIT = 6;

export default async function InstitutionDashboard() {
  const user = await requirePageRole("INSTITUTION");
  const t = await getTranslations("dashboards.institution");
  const tTypes = await getTranslations("fdr.discrepancies.types");
  const tDocs = await getTranslations("fdr.documents.types");
  const tRelease = await getTranslations("fdr.releaseStatus");
  const tText = await getTranslations("notifications.text");
  const locale = await getLocale();
  const now = new Date();

  // Every query is scoped to the signed-in user's institution.
  const scope = { institutionId: user.institutionId ?? "__none__" };
  const held = { ...scope, status: { notIn: [...FINISHED] } };

  const [total, totalAmount, expiringSoon, openDiscrepancies, upcoming, missingScans, withCoveringLetter, heldCount, releases, notifications] =
    await Promise.all([
      db.fdr.count({ where: scope }),
      db.fdr.aggregate({ where: held, _sum: { amount: true } }),
      db.fdr.count({ where: { ...held, maturityDate: { gte: now, lte: addDays(now, 90) } } }),
      db.discrepancy.findMany({
        where: { fdr: scope, status: "OPEN" },
        orderBy: { createdAt: "asc" },
        include: { fdr: { select: { id: true, referenceNo: true } } },
      }),
      db.fdr.findMany({ where: held, orderBy: { maturityDate: "asc" }, take: 6 }),
      db.fdr.findMany({
        where: { ...held, documents: { none: { type: "FDR_SCAN", isCurrent: true } } },
        select: { id: true, referenceNo: true },
      }),
      db.fdr.count({ where: { ...held, documents: { some: { type: "COVERING_LETTER", isCurrent: true } } } }),
      db.fdr.count({ where: held }),
      db.releaseRequest.findMany({
        where: { fdr: scope },
        orderBy: { requestedAt: "desc" },
        take: 5,
        include: { fdr: { select: { id: true, referenceNo: true } } },
      }),
      db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 5 }),
    ]);

  const actions = [
    ...openDiscrepancies.map((item) => ({
      key: item.id,
      icon: AlertTriangle,
      href: `/fdrs/${item.fdr.id}`,
      reference: item.fdr.referenceNo,
      text: tTypes(item.type),
    })),
    ...missingScans
      // A missing scan already raises a discrepancy, so don't list that FDR twice.
      .filter((fdr) => !openDiscrepancies.some((item) => item.fdr.id === fdr.id && item.type === "MISSING_DOCUMENT"))
      .map((fdr) => ({ key: fdr.id, icon: FileWarning, href: `/fdrs/${fdr.id}`, reference: fdr.referenceNo, text: t("uploadScan") })),
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{user.institution?.name}</p>
        </div>
        <Button asChild>
          <Link href="/fdrs/new">
            <Plus />
            {t("submitNew")}
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t("myFdrs")} value={total} icon={FileText} />
        <StatCard label={t("amountHeld")} value={formatInr(totalAmount._sum.amount ?? 0, locale)} icon={IndianRupee} />
        <StatCard label={t("maturing90")} value={expiringSoon} icon={CalendarClock} />
        <StatCard label={t("openDiscrepancies")} value={openDiscrepancies.length} icon={AlertTriangle} />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>{t("actionsTitle")}</CardTitle>
            <CardDescription>{t("actionsHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            {actions.length === 0 ? (
              <EmptyState icon={CircleCheck} title={t("actionsEmpty")} />
            ) : (
              <ul className="divide-y">
                {actions.slice(0, ACTION_LIMIT).map((action) => {
                  const Icon = action.icon;
                  return (
                    <li key={action.key}>
                      <Link href={action.href} className="group flex items-center gap-3 py-3 text-sm">
                        <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium tabular-nums">{action.reference}</span>
                          <span className="block text-muted-foreground">{action.text}</span>
                        </span>
                        <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            {actions.length > ACTION_LIMIT && <p className="mt-2 text-xs text-muted-foreground">{t("moreActions", { count: actions.length - ACTION_LIMIT })}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("checklistTitle")}</CardTitle>
            <CardDescription>{t("checklistHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3 text-sm">
              {[
                { key: "FDR_SCAN" as const, have: heldCount - missingScans.length },
                { key: "COVERING_LETTER" as const, have: withCoveringLetter },
              ].map((row) => (
                <li key={row.key} className="flex items-center gap-2">
                  {row.have === heldCount ? (
                    <CircleCheck className="size-4 shrink-0 text-status-green" aria-hidden />
                  ) : (
                    <CircleDashed className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  )}
                  <span className="flex-1">{tDocs(row.key)}</span>
                  <span className="font-medium tabular-nums">{t("ofFdrs", { have: row.have, total: heldCount })}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("upcomingTitle")}</CardTitle>
          <CardDescription>{t("upcomingHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          {upcoming.length === 0 ? (
            <EmptyState title={t("noFdrs")} />
          ) : (
            <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {upcoming.map((fdr) => {
                const days = daysUntil(fdr.maturityDate, now);
                return (
                  <li key={fdr.id}>
                    <Link href={`/fdrs/${fdr.id}`} className="flex h-full flex-col gap-3 rounded-lg border bg-background/60 p-4 transition-colors hover:border-primary/50">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{fdr.referenceNo}</p>
                          <p className="truncate text-xs text-muted-foreground">{fdr.bankName}</p>
                        </div>
                        <StatusChip status={fdr.status} />
                      </div>
                      <div>
                        <p className="text-xl font-semibold tabular-nums">
                          {days < 0 ? t("overdueBy", { days: -days }) : t("daysLeft", { days })}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(fdr.maturityDate, locale)} · {formatInr(fdr.amount, locale)}
                        </p>
                      </div>
                      <TrustBadge level={fdr.trustLevel} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("releaseTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            {releases.length === 0 ? (
              <EmptyState title={t("releaseEmpty")} />
            ) : (
              <ul className="divide-y text-sm">
                {releases.map((release) => (
                  <li key={release.id} className="flex items-center justify-between gap-3 py-2.5">
                    <Link href={`/fdrs/${release.fdr.id}`} className="font-medium text-primary underline-offset-4 hover:underline">{release.fdr.referenceNo}</Link>
                    <span className="text-muted-foreground">{tRelease(release.status)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("notificationsTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            {notifications.length === 0 ? (
              <EmptyState icon={Bell} title={t("notificationsEmpty")} />
            ) : (
              <ul className="divide-y text-sm">
                {notifications.map((item) => (
                  <li key={item.id} className="py-2.5">
                    <p className="font-medium">{renderText(item.title, tText)}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(item.createdAt, locale)}</p>
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
