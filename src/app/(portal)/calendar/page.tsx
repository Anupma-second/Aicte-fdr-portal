import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/common/empty-state";
import { RiskDot } from "@/components/fdr/risk-dot";
import { StatusChip } from "@/components/fdr/status-chip";
import { TrustBadge } from "@/components/fdr/trust-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePageRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { fdrScope } from "@/lib/fdr/queries";
import type { RiskReason } from "@/lib/fdr/risk";
import { cn, formatDate, formatInr } from "@/lib/utils";

/** Finished deposits no longer need watching, so they don't count towards a cluster. */
const FINISHED = ["RENEWED", "REPLACED", "RELEASED", "CLOSED"] as const;

/** One hue from light to dark. More FDRs on a day means a darker cell. */
function heatClass(count: number): string {
  if (count === 0) return "bg-card";
  if (count === 1) return "bg-primary/15";
  if (count === 2) return "bg-primary/35";
  if (count === 3) return "bg-primary/60 text-primary-foreground";
  return "bg-primary text-primary-foreground";
}

function parseMonth(value: unknown, now: Date): { year: number; month: number } {
  const match = typeof value === "string" ? /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value) : null;
  return match ? { year: Number(match[1]), month: Number(match[2]) - 1 } : { year: now.getUTCFullYear(), month: now.getUTCMonth() };
}

function monthKey(year: number, month: number): string {
  const date = new Date(Date.UTC(year, month, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePageRole();
  const params = await searchParams;
  const t = await getTranslations("calendar");
  const locale = await getLocale();
  const intlLocale = locale === "hi" ? "hi-IN" : "en-IN";
  const now = new Date();

  const { year, month } = parseMonth(params.month, now);
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 1));
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  const dayParam = Number(params.day);
  const selectedDay = Number.isInteger(dayParam) && dayParam >= 1 && dayParam <= daysInMonth ? dayParam : null;

  const baseWhere = { ...fdrScope(user), status: { notIn: [...FINISHED] } };
  const inMonth = await db.fdr.findMany({
    where: { ...baseWhere, maturityDate: { gte: start, lt: end } },
    select: { maturityDate: true },
  });
  const counts = new Map<number, number>();
  for (const fdr of inMonth) {
    const day = fdr.maturityDate.getUTCDate();
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }

  const selected = selectedDay
    ? await db.fdr.findMany({
        where: { ...baseWhere, maturityDate: new Date(Date.UTC(year, month, selectedDay)) },
        orderBy: { riskScore: "desc" },
        include: { institution: { select: { name: true } } },
      })
    : [];

  // Monday first. getUTCDay() counts from Sunday.
  const leadingBlanks = (start.getUTCDay() + 6) % 7;
  const weekdays = Array.from({ length: 7 }, (_, index) =>
    new Intl.DateTimeFormat(intlLocale, { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 1 + index))),
  );
  const title = new Intl.DateTimeFormat(intlLocale, { month: "long", year: "numeric", timeZone: "UTC" }).format(start);
  const current = monthKey(year, month);
  const isThisMonth = year === now.getUTCFullYear() && month === now.getUTCMonth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("hint")}</p>
      </div>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-lg">{title}</CardTitle>
          <div className="flex items-center gap-1">
            <Button asChild variant="outline" size="icon" aria-label={t("previous")}>
              <Link href={`/calendar?month=${monthKey(year, month - 1)}`}><ChevronLeft /></Link>
            </Button>
            {!isThisMonth && (
              <Button asChild variant="ghost">
                <Link href="/calendar">{t("today")}</Link>
              </Button>
            )}
            <Button asChild variant="outline" size="icon" aria-label={t("next")}>
              <Link href={`/calendar?month=${monthKey(year, month + 1)}`}><ChevronRight /></Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
            {weekdays.map((day) => (
              <div key={day} aria-hidden className="py-1 text-center text-xs font-medium text-muted-foreground">{day}</div>
            ))}
            {Array.from({ length: leadingBlanks }, (_, index) => <div key={`blank-${index}`} />)}
            {Array.from({ length: daysInMonth }, (_, index) => {
              const day = index + 1;
              const count = counts.get(day) ?? 0;
              const isToday = isThisMonth && day === now.getUTCDate();
              const dayDate = formatDate(new Date(Date.UTC(year, month, day)), locale);
              const label = t("dayLabel", { date: dayDate, count });
              const className = cn(
                "flex aspect-square min-h-10 flex-col items-center justify-center rounded-lg border text-sm transition-colors sm:aspect-[4/3]",
                heatClass(count),
                isToday && "ring-2 ring-gold",
                selectedDay === day && "outline-2 outline-offset-1 outline-foreground",
              );
              return count > 0 ? (
                <Link key={day} href={`/calendar?month=${current}&day=${day}`} aria-label={label} aria-current={selectedDay === day ? "date" : undefined} className={cn(className, "hover:border-primary")}>
                  <span>{day}</span>
                  <span className="text-[11px] leading-none font-semibold tabular-nums">{count}</span>
                </Link>
              ) : (
                <div key={day} aria-label={label} role="img" className={cn(className, "text-muted-foreground")}>{day}</div>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
            <span>{t("legend")}</span>
            {[1, 2, 3, 4].map((count) => (
              <span key={count} className="flex items-center gap-1.5">
                <span className={cn("size-3.5 rounded border", heatClass(count))} aria-hidden />
                {count === 4 ? "4+" : count}
              </span>
            ))}
            <span className="ml-auto">{t("monthTotal", { count: inMonth.length })}</span>
          </div>
        </CardContent>
      </Card>

      {selectedDay ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("dayTitle", { date: formatDate(new Date(Date.UTC(year, month, selectedDay)), locale) })}</CardTitle>
          </CardHeader>
          <CardContent>
            {selected.length === 0 ? (
              <EmptyState icon={CalendarDays} title={t("dayEmpty")} />
            ) : (
              <ul className="divide-y">
                {selected.map((fdr) => (
                  <li key={fdr.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 text-sm">
                    <Link href={`/fdrs/${fdr.id}`} className="font-medium text-primary tabular-nums underline-offset-4 hover:underline">{fdr.referenceNo}</Link>
                    {user.role !== "INSTITUTION" && <span className="min-w-0 flex-1 basis-40 truncate">{fdr.institution.name}</span>}
                    <span className="tabular-nums">{formatInr(fdr.amount, locale)}</span>
                    <StatusChip status={fdr.status} />
                    <TrustBadge level={fdr.trustLevel} />
                    <RiskDot level={fdr.riskLevel} score={fdr.riskScore} reasons={(fdr.riskReasons ?? []) as unknown as RiskReason[]} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : (
        inMonth.length > 0 && <p className="text-sm text-muted-foreground">{t("clickHint")}</p>
      )}
    </div>
  );
}
