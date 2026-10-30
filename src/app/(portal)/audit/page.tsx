import type { Prisma } from "@prisma/client";
import { ChevronLeft, ChevronRight, ScrollText } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { AuditIntegrityPanel } from "@/components/common/audit-integrity-panel";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getActiveSimulation, isSimulationAllowed } from "@/lib/audit/simulation";
import { requirePageRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";

const PAGE_SIZE = 25;
const HASH_PREVIEW = 12;

function one(value: string | string[] | undefined): string {
  return typeof value === "string" ? value.trim().slice(0, 100) : "";
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePageRole("COMPETENT_AUTHORITY", "ADMIN");
  const params = await searchParams;
  const t = await getTranslations("audit");
  const locale = await getLocale();

  const actor = one(params.actor);
  const action = one(params.action);
  const entryText = one(params.entry);
  const entry = /^\d{1,18}$/.test(entryText) ? BigInt(entryText) : null;
  const pageNumber = Number(params.page);
  const page = Number.isInteger(pageNumber) && pageNumber > 0 ? pageNumber : 1;

  const where: Prisma.AuditLogWhereInput = entry !== null
    ? { id: entry }
    : { ...(actor ? { actorLabel: { contains: actor } } : {}), ...(action ? { action } : {}) };

  const [total, rows, actions, activeEntry] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({ where, orderBy: { id: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    db.auditLog.groupBy({ by: ["action"], orderBy: { action: "asc" } }),
    getActiveSimulation(),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (target: number) => {
    const query = new URLSearchParams();
    if (actor) query.set("actor", actor);
    if (action) query.set("action", action);
    if (target > 1) query.set("page", String(target));
    return `/audit?${query}`;
  };
  const time = new Intl.DateTimeFormat(locale === "hi" ? "hi-IN" : "en-IN", { dateStyle: "medium", timeStyle: "medium", timeZone: "Asia/Kolkata" });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("hint")}</p>
      </div>

      <AuditIntegrityPanel canSimulate={user.role === "ADMIN" && isSimulationAllowed()} activeEntry={activeEntry} />

      <Card className="p-4">
        <form method="get" action="/audit" className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
          <div className="space-y-1">
            <label htmlFor="actor" className="text-xs font-medium">{t("actor")}</label>
            <Input id="actor" name="actor" type="search" defaultValue={actor} />
          </div>
          <div className="space-y-1">
            <label htmlFor="action" className="text-xs font-medium">{t("action")}</label>
            <select id="action" name="action" defaultValue={action} className="flex h-10 w-full rounded-lg border border-input bg-card px-3 text-sm">
              <option value="">{t("allActions")}</option>
              {actions.map((row) => <option key={row.action} value={row.action}>{row.action}</option>)}
            </select>
          </div>
          <Button type="submit">{t("apply")}</Button>
          <Button asChild variant="ghost">
            <Link href="/audit">{t("clear")}</Link>
          </Button>
        </form>
      </Card>

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState icon={ScrollText} title={t("empty")} />
        ) : (
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  {["entry", "time", "actor", "action", "subject", "hash", "details"].map((column) => (
                    <th key={column} scope="col" className="sticky top-0 z-10 bg-card px-4 py-3 font-medium whitespace-nowrap">{t(`columns.${column}`)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id.toString()} className="border-t align-top">
                    <td className="px-4 py-3 tabular-nums">{row.id.toString()}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{time.format(row.occurredAt)}</td>
                    <td className="max-w-48 truncate px-4 py-3" title={row.actorLabel}>{row.actorLabel}</td>
                    <td className="px-4 py-3 font-medium whitespace-nowrap">{row.action}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{row.entityType}</td>
                    <td className="px-4 py-3 font-mono text-xs whitespace-nowrap" title={`${t("hashFull")}: ${row.hash}\n${t("prevHash")}: ${row.prevHash}`}>{row.hash.slice(0, HASH_PREVIEW)}…</td>
                    <td className="max-w-80 px-4 py-3">
                      <details>
                        <summary className="cursor-pointer text-primary">{t("view")}</summary>
                        <pre className="mt-2 rounded bg-muted p-2 font-mono text-xs break-all whitespace-pre-wrap">{row.payload}</pre>
                        <p className="mt-1 font-mono text-xs break-all text-muted-foreground">{t("prevHash")}: {row.prevHash}</p>
                      </details>
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
          {page > 1 ? (
            <Button asChild variant="outline" size="sm"><Link href={pageHref(page - 1)}><ChevronLeft />{t("previous")}</Link></Button>
          ) : <span />}
          <span className="text-muted-foreground">{t("page", { page, pages })}</span>
          {page < pages ? (
            <Button asChild variant="outline" size="sm"><Link href={pageHref(page + 1)}>{t("next")}<ChevronRight /></Link></Button>
          ) : <span />}
        </nav>
      )}
    </div>
  );
}
