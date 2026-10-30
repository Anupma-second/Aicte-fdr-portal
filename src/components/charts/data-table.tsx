import { useTranslations } from "next-intl";

/** The same numbers as the chart above it, for screen readers and anyone who prefers a table. */
export function ChartTable({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
  const t = useTranslations("dashboards.authority");
  return (
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer text-xs font-medium text-muted-foreground">{t("viewTable")}</summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-left">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b">
              {headers.map((header) => <th key={header} scope="col" className="py-1.5 pr-4 font-medium">{header}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={String(row[0])} className="border-b last:border-0">
                {row.map((cell, index) => <td key={index} className="py-1.5 pr-4 tabular-nums">{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
