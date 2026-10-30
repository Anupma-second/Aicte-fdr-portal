"use client";

import type { ReleaseStatus } from "@prisma/client";
import { Check, HandCoins, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RELEASE_STEPS, type ReleaseAction, type ReleaseBlocker } from "@/lib/fdr/release-rules";
import { cn, formatDate } from "@/lib/utils";

const KNOWN_ERRORS = ["RELEASE_NOT_AVAILABLE", "RELEASE_ACTION_NOT_AVAILABLE", "RELEASE_BLOCKED_NO_APPLICATION", "RELEASE_BLOCKED_UNRESOLVED", "NOTE_REQUIRED", "VALIDATION_ERROR"];
const TEXTAREA = "w-full rounded-lg border border-input bg-card px-3 py-2 text-sm";

export type ReleaseView = {
  id: string;
  status: ReleaseStatus;
  reason: string;
  requestedAt: string;
  decidedByName: string | null;
  decisionNote: string | null;
};

export function ReleasePanel({
  fdrId,
  request,
  canRequest,
  actions,
  blockers,
}: {
  fdrId: string;
  request: ReleaseView | null;
  canRequest: boolean;
  actions: ReleaseAction[];
  blockers: ReleaseBlocker[];
}) {
  const t = useTranslations("fdr.release");
  const tStatus = useTranslations("fdr.releaseStatus");
  const locale = useLocale();
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function send(url: string, body: object, key: string, successKey: string) {
    setBusy(key);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) {
        toast.error(t(`errors.${KNOWN_ERRORS.includes(result.error?.code) ? result.error.code : "GENERIC"}`));
        return;
      }
      toast.success(t(`done.${successKey}`));
      setText("");
      router.refresh();
    } catch {
      toast.error(t("errors.GENERIC"));
    } finally {
      setBusy(null);
    }
  }

  const reachedIndex = request ? RELEASE_STEPS.indexOf(request.status) : -1;
  const rejected = request?.status === "REJECTED";
  // Once finished or rejected, a new request is a new story, so the old steps aren't drawn as current.
  const showRequestForm = canRequest;

  if (!request && !canRequest) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("hint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {request && (
          <>
            {rejected ? (
              <p className="rounded-lg bg-status-red-bg px-3 py-2 text-sm font-medium text-status-red">{tStatus("REJECTED")}</p>
            ) : (
              <ol className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
                {RELEASE_STEPS.map((step, index) => {
                  const done = index < reachedIndex || request.status === "CLOSED";
                  const current = index === reachedIndex && request.status !== "CLOSED";
                  return (
                    <li
                      key={step}
                      aria-current={current ? "step" : undefined}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs font-medium",
                        current && "border-primary bg-primary text-primary-foreground",
                        done && "bg-secondary text-secondary-foreground",
                        !current && !done && "text-muted-foreground",
                      )}
                    >
                      {done ? <Check className="size-3.5 shrink-0" aria-hidden /> : <span className="w-3.5 shrink-0 text-center">{index + 1}</span>}
                      {tStatus(step)}
                    </li>
                  );
                })}
              </ol>
            )}
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">{t("reason")} · {formatDate(new Date(request.requestedAt), locale)}</dt>
                <dd className="break-words">{request.reason}</dd>
              </div>
              {request.decisionNote && (
                <div>
                  <dt className="text-xs text-muted-foreground">{t("decision")}{request.decidedByName ? ` · ${request.decidedByName}` : ""}</dt>
                  <dd className="break-words">{request.decisionNote}</dd>
                </div>
              )}
            </dl>
          </>
        )}

        {blockers.length > 0 && (
          <ul className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
            {blockers.map((blocker) => <li key={blocker}>{t(`blockers.${blocker}`)}</li>)}
          </ul>
        )}

        {request && actions.length > 0 && (
          <div className="space-y-2 border-t pt-4">
            <label htmlFor="release-note" className="text-sm font-medium">{t(actions.includes("REJECT") ? "noteRequired" : "note")}</label>
            <textarea id="release-note" rows={2} maxLength={2000} value={text} onChange={(event) => setText(event.target.value)} className={TEXTAREA} />
            <div className="flex flex-wrap gap-2">
              {actions.map((action) => (
                <Button
                  key={action}
                  variant={action === "REJECT" ? "outline" : "default"}
                  disabled={busy !== null || (action === "ADVANCE" && blockers.length > 0) || (action === "REJECT" && text.trim().length < 5)}
                  onClick={() => void send(`/api/release/${request.id}`, { action, note: text }, action, action)}
                >
                  {busy === action && <Loader2 className="animate-spin" />}
                  {t(`actions.${action}`)}
                </Button>
              ))}
            </div>
          </div>
        )}

        {showRequestForm && (
          <form
            className="space-y-2 border-t pt-4"
            onSubmit={(event) => {
              event.preventDefault();
              void send(`/api/fdrs/${fdrId}/release`, { reason: text }, "REQUEST", "REQUEST");
            }}
          >
            <label htmlFor="release-reason" className="flex items-center gap-2 text-sm font-medium">
              <HandCoins className="size-4" aria-hidden />
              {t("requestTitle")}
            </label>
            <textarea id="release-reason" required minLength={10} maxLength={2000} rows={3} value={text} onChange={(event) => setText(event.target.value)} placeholder={t("requestPlaceholder")} className={TEXTAREA} />
            <p className="text-xs text-muted-foreground">{t("requestHint")}</p>
            <Button type="submit" disabled={busy !== null}>
              {busy === "REQUEST" && <Loader2 className="animate-spin" />}
              {t("requestSubmit")}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
