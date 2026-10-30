import type { FdrStatus, TrustLevel } from "@prisma/client";
import { ArrowDown } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Fragment } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, formatDate, formatInr } from "@/lib/utils";
import { StatusChip } from "./status-chip";
import { TrustBadge } from "./trust-badge";

type ChainItem = {
  id: string;
  referenceNo: string;
  status: FdrStatus;
  trustLevel: TrustLevel;
  amount: { toString(): string };
  bankName: string;
  maturityDate: Date;
  renewedTo: { type: "RENEWAL" | "REPLACEMENT" } | null;
};

export function RenewalChain({ chain, currentId }: { chain: ChainItem[]; currentId: string }) {
  const t = useTranslations("fdr.chain");
  const locale = useLocale();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("hint")}</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="space-y-1">
          {chain.map((item) => (
            <Fragment key={item.id}>
              <li>
                <Link
                  href={`/fdrs/${item.id}`}
                  aria-current={item.id === currentId ? "page" : undefined}
                  className={cn(
                    "block rounded-lg border bg-background/60 p-3 transition-colors hover:border-primary/50",
                    item.id === currentId && "border-primary",
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium tabular-nums">{item.referenceNo}</span>
                    <StatusChip status={item.status} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.bankName} · {formatInr(item.amount, locale)} · {formatDate(item.maturityDate, locale)}
                  </p>
                  <div className="mt-2">
                    <TrustBadge level={item.trustLevel} />
                  </div>
                </Link>
              </li>
              {item.renewedTo && (
                <li className="flex items-center gap-2 py-1 pl-3 text-xs text-muted-foreground">
                  <ArrowDown className="size-3.5" aria-hidden />
                  {t(item.renewedTo.type)}
                </li>
              )}
            </Fragment>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
