"use client";

import { useTranslations } from "next-intl";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const AXIS = { fontSize: 12, fill: "var(--muted-foreground)" };
const GRID = "var(--border)";

function ChartTooltip({ active, label, value }: { active?: boolean; label?: string; value?: string }) {
  if (!active || !value) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-soft">
      <p className="font-medium">{label}</p>
      <p className="mt-0.5 tabular-nums">{value}</p>
    </div>
  );
}

export type BarDatum = { label: string; value: number; display: string; axis: string };

/** One series, so the card title names it and no legend is needed. Every value is also in the table view. */
export function HorizontalBars({ data, ariaLabel, labelWidth = 110 }: { data: BarDatum[]; ariaLabel: string; labelWidth?: number }) {
  const height = Math.max(160, data.length * 40 + 30);
  const axisByValue = new Map(data.map((item) => [item.value, item.axis]));
  return (
    <div role="img" aria-label={ariaLabel} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }} barCategoryGap="30%">
          <CartesianGrid horizontal={false} stroke={GRID} strokeDasharray="3 3" />
          <XAxis type="number" tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(value: number) => axisByValue.get(value) ?? compact(value)} />
          <YAxis type="category" dataKey="label" width={labelWidth} tick={AXIS} axisLine={false} tickLine={false} interval={0} />
          <Tooltip
            cursor={{ fill: "var(--muted)" }}
            content={({ active, payload, label }) => (
              <ChartTooltip active={active} label={String(label ?? "")} value={(payload?.[0]?.payload as BarDatum | undefined)?.display} />
            )}
          />
          <Bar dataKey="value" fill="var(--primary)" radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function compact(value: number): string {
  if (value >= 10_000_000) return `${Math.round(value / 1_000_000) / 10} Cr`;
  if (value >= 100_000) return `${Math.round(value / 10_000) / 10} L`;
  return String(value);
}

export type TrendDatum = { label: string; days: number | null; cases: number };

export function TrendLine({ data, ariaLabel }: { data: TrendDatum[]; ariaLabel: string }) {
  const t = useTranslations("dashboards.authority");
  return (
    <div role="img" aria-label={ariaLabel} className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 16, bottom: 0, left: -16 }}>
          <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="3 3" />
          <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} />
          <YAxis tick={AXIS} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip
            cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
            content={({ active, payload, label }) => {
              const point = payload?.[0]?.payload as TrendDatum | undefined;
              return (
                <ChartTooltip
                  active={active}
                  label={String(label ?? "")}
                  value={point?.days == null ? undefined : t("trendTooltip", { days: point.days, cases: point.cases })}
                />
              );
            }}
          />
          <Line type="monotone" dataKey="days" stroke="var(--primary)" strokeWidth={2} dot={{ r: 4, fill: "var(--primary)", stroke: "var(--card)", strokeWidth: 2 }} activeDot={{ r: 6 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
