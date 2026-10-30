import { Activity, ArrowRight, Building2, CircleCheck, Link2, Plug, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { AlertRulesPanel } from "@/components/common/alert-rules-panel";
import { EmptyState } from "@/components/common/empty-state";
import { StatCard } from "@/components/common/stat-card";
import { PendingActions } from "@/components/common/user-admin";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePageRole } from "@/lib/auth/guards";
import { getSystemHealth, type HealthState } from "@/lib/dashboard/health";
import { db } from "@/lib/db";
import { cn, formatDate } from "@/lib/utils";

const STATE_STYLE: Record<HealthState, string> = {
  ok: "bg-status-green-bg text-status-green",
  warning: "bg-status-amber-bg text-status-amber",
  error: "bg-status-red-bg text-status-red",
};

export default async function AdminDashboard() {
  await requirePageRole("ADMIN");
  const t = await getTranslations("dashboards.admin");
  const locale = await getLocale();

  const [users, institutions, auditEntries, pending, rules, health] = await Promise.all([
    db.user.count(),
    db.institution.count(),
    db.auditLog.count(),
    db.user.findMany({
      where: { status: "PENDING_APPROVAL" },
      orderBy: { createdAt: "asc" },
      include: { institution: { select: { name: true, state: true, aicteCode: true } } },
    }),
    db.alertRule.findMany({ select: { id: true, kind: true, days: true, targetLevel: true, isActive: true } }),
    getSystemHealth(),
  ]);

  const integrations: { key: string; state: HealthState; value: string }[] = [
    { key: "bank", state: "warning", value: t("integrationValues.bankMock") },
    { key: "email", state: health.integrations.email === "smtp" ? "ok" : "warning", value: t(health.integrations.email === "smtp" ? "integrationValues.emailSmtp" : "integrationValues.emailConsole") },
    { key: "ocr", state: "ok", value: t("integrationValues.ocrLocal") },
    { key: "storage", state: "ok", value: t("integrationValues.storageLocal") },
  ];

  function statusChip(state: HealthState, text: string) {
    return <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", STATE_STYLE[state])}>{text}</span>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t("users")} value={users} icon={Users} />
        <StatCard label={t("institutions")} value={institutions} icon={Building2} />
        <StatCard label={t("pendingApprovals")} value={pending.length} icon={ShieldCheck} />
        <StatCard label={t("auditEntries")} value={auditEntries} icon={Link2} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("pendingTitle")}</CardTitle>
          <CardDescription>{t("pendingHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          {pending.length === 0 ? (
            <EmptyState icon={CircleCheck} title={t("pendingEmpty")} />
          ) : (
            <ul className="divide-y">
              {pending.map((user) => (
                <li key={user.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-medium">{user.institution?.name ?? user.name}</p>
                    <p className="text-xs break-all text-muted-foreground">
                      {user.email}
                      {user.institution ? ` · ${user.institution.aicteCode} · ${user.institution.state}` : ""}
                    </p>
                  </div>
                  <PendingActions userId={user.id} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/admin/users" className="group flex items-center gap-3 rounded-xl border bg-card p-5 shadow-soft transition-colors hover:border-primary/50">
          <Users className="size-6 text-primary" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{t("manageUsers")}</span>
            <span className="block text-sm text-muted-foreground">{t("manageUsersHint")}</span>
          </span>
          <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
        </Link>
        <Link href="/audit" className="group flex items-center gap-3 rounded-xl border bg-card p-5 shadow-soft transition-colors hover:border-primary/50">
          <ShieldCheck className="size-6 text-primary" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{t("auditLink")}</span>
            <span className="block text-sm text-muted-foreground">{t("auditLinkHint")}</span>
          </span>
          <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
        </Link>
      </div>

      <AlertRulesPanel rules={rules} />

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Plug className="size-4" aria-hidden />{t("integrationsTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {integrations.map((item) => (
                <li key={item.key} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="font-medium">{t(`integrationNames.${item.key}`)}</span>
                  {statusChip(item.state, item.value)}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Activity className="size-4" aria-hidden />{t("healthTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {health.checks.map((check) => (
                <li key={check.key} className="flex items-center justify-between gap-3 py-2.5">
                  <span>
                    <span className="block font-medium">{t(`healthNames.${check.key}`)}</span>
                    {check.key === "alertJob" && (
                      <span className="block text-xs text-muted-foreground">
                        {health.lastJobRun ? t("lastRun", { date: formatDate(health.lastJobRun, locale) }) : t("neverRun")}
                      </span>
                    )}
                  </span>
                  {statusChip(check.state, check.value ?? t(`healthStates.${check.state}`))}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
