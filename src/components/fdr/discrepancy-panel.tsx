"use client";

import type { DiscrepancySeverity, DiscrepancySource, DiscrepancyStatus, DiscrepancyType } from "@prisma/client";
import { CircleCheck, Loader2, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { renderText } from "@/lib/notifications/format";
import { cn } from "@/lib/utils";
import { useScrutinyAction } from "./scrutiny-panel";

export type DiscrepancyItem = {
  id: string;
  type: DiscrepancyType;
  severity: DiscrepancySeverity;
  status: DiscrepancyStatus;
  source: DiscrepancySource;
  message: string;
  declaredValue: string | null;
  extractedValue: string | null;
  response: string | null;
};

const STATUS_STYLE: Record<DiscrepancyStatus, string> = {
  OPEN: "bg-status-red-bg text-status-red",
  RESPONDED: "bg-status-amber-bg text-status-amber",
  RESOLVED: "bg-status-green-bg text-status-green",
  WAIVED: "bg-status-grey-bg text-status-grey",
};

function Respond({ fdrId, discrepancyId }: { fdrId: string; discrepancyId: string }) {
  const t = useTranslations("fdr.discrepancies");
  const router = useRouter();
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [tooShort, setTooShort] = useState(false);
  const fieldId = `response-${discrepancyId}`;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (text.trim().length < 5) {
      setTooShort(true);
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`/api/fdrs/${fdrId}/discrepancies/${discrepancyId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: text }),
      });
      if (!response.ok) {
        toast.error(t("respondFailed"));
        return;
      }
      toast.success(t("responded"));
      router.refresh();
    } catch {
      toast.error(t("respondFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-2">
      <label htmlFor={fieldId} className="text-sm font-medium">{t("yourResponse")}</label>
      <textarea
        id={fieldId}
        value={text}
        rows={2}
        maxLength={2000}
        onChange={(event) => {
          setText(event.target.value);
          setTooShort(false);
        }}
        aria-invalid={tooShort}
        className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm"
      />
      {tooShort && <p className="text-xs text-status-red">{t("tooShort")}</p>}
      <Button type="submit" size="sm" disabled={saving}>
        {saving && <Loader2 className="animate-spin" />}
        {t("send")}
      </Button>
    </form>
  );
}

function Review({ fdrId, item }: { fdrId: string; item: DiscrepancyItem }) {
  const t = useTranslations("fdr.discrepancies");
  const { run, busy } = useScrutinyAction(fdrId);
  const [note, setNote] = useState("");
  const fieldId = `review-${item.id}`;
  return (
    <form
      className="mt-3 space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        void run({ action: "CLOSE_DISCREPANCY", discrepancyId: item.id, note });
      }}
    >
      <label htmlFor={fieldId} className="text-sm font-medium">{t("reviewNote")}</label>
      <textarea id={fieldId} required minLength={5} maxLength={2000} rows={2} value={note} onChange={(event) => setNote(event.target.value)} className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm" />
      <p className="text-xs text-muted-foreground">{t(item.source === "SYSTEM" ? "waiveHint" : "resolveHint")}</p>
      <Button type="submit" size="sm" variant="outline" disabled={busy !== null}>
        {busy && <Loader2 className="animate-spin" />}
        {t(item.source === "SYSTEM" ? "waive" : "resolve")}
      </Button>
    </form>
  );
}

export function DiscrepancyPanel({ fdrId, items, canRespond, canReview = false }: { fdrId: string; items: DiscrepancyItem[]; canRespond: boolean; canReview?: boolean }) {
  const t = useTranslations("fdr.discrepancies");
  const tText = useTranslations("notifications.text");
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <EmptyState icon={CircleCheck} title={t("none")} />
        ) : (
          <ul className="space-y-3">
            {items.map((item) => (
              <li key={item.id} className="rounded-lg border bg-background/60 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="flex items-start gap-2 text-sm font-medium">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                    {item.source === "OFFICER" ? renderText(item.message, tText) : t(`types.${item.type}`)}
                  </p>
                  <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", STATUS_STYLE[item.status])}>
                    {t(`status.${item.status}`)}
                  </span>
                </div>
                {(item.declaredValue || item.extractedValue) && (
                  <dl className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                    {item.declaredValue && (
                      <div>
                        <dt className="text-xs text-muted-foreground">{t("declared")}</dt>
                        <dd className="break-words">{item.declaredValue}</dd>
                      </div>
                    )}
                    {item.extractedValue && (
                      <div>
                        <dt className="text-xs text-muted-foreground">{t("extracted")}</dt>
                        <dd className="break-words">{item.extractedValue}</dd>
                      </div>
                    )}
                  </dl>
                )}
                {item.response && (
                  <p className="mt-2 rounded bg-muted px-3 py-2 text-sm">
                    <span className="block text-xs text-muted-foreground">{t("response")}</span>
                    {item.response}
                  </p>
                )}
                {canRespond && item.status === "OPEN" && <Respond fdrId={fdrId} discrepancyId={item.id} />}
                {canReview && (item.status === "OPEN" || item.status === "RESPONDED") && <Review fdrId={fdrId} item={item} />}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
