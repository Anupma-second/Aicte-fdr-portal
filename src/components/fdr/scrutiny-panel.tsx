"use client";

import { BadgeCheck, CheckCircle2, FileCheck2, FlagTriangleRight, GitBranch, Landmark, Loader2, MessageSquarePlus, Play, Send, Power, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { ApprovalBlocker, ScrutinyAction } from "@/lib/fdr/scrutiny-rules";
import { formatDate } from "@/lib/utils";

const KNOWN_ERRORS = [
  "ASSIGNED_ELSEWHERE",
  "ACTION_NOT_AVAILABLE",
  "SUCCESSOR_NOT_FOUND",
  "SUCCESSOR_SAME",
  "SUCCESSOR_LINKED",
  "SUCCESSOR_OLDER",
  "SUCCESSOR_FINISHED",
  "VALIDATION_ERROR",
];

const ONE_CLICK: { action: ScrutinyAction; icon: LucideIcon; primary?: boolean }[] = [
  { action: "START", icon: Play, primary: true },
  { action: "VERIFY_DOCUMENTS", icon: FileCheck2 },
  { action: "BANK_VERIFY", icon: Landmark },
  { action: "SEND_BACK", icon: Send },
  { action: "APPROVE", icon: BadgeCheck, primary: true },
  { action: "ACTIVATE", icon: CheckCircle2, primary: true },
  { action: "CLOSE", icon: Power },
];

const TEXTAREA = "w-full rounded-lg border border-input bg-card px-3 py-2 text-sm";
const SELECT = "flex h-10 w-full rounded-lg border border-input bg-card px-3 text-sm";

export type ObservationItem = { id: string; note: string; officerName: string; createdAt: string };

export function useScrutinyAction(fdrId: string) {
  const t = useTranslations("fdr.scrutiny");
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function run(body: Record<string, unknown>): Promise<boolean> {
    setBusy(String(body.action));
    try {
      const response = await fetch(`/api/fdrs/${fdrId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) {
        toast.error(t(`errors.${KNOWN_ERRORS.includes(result.error?.code) ? result.error.code : "GENERIC"}`));
        return false;
      }
      toast.success(body.action === "BANK_VERIFY" ? t(`bankResult.${result.result}`) : t(`done.${body.action}`));
      router.refresh();
      return true;
    } catch {
      toast.error(t("errors.GENERIC"));
      return false;
    } finally {
      setBusy(null);
    }
  }
  return { run, busy };
}

export function ScrutinyPanel({
  fdrId,
  actions,
  blockers,
  assignedElsewhere,
  observations,
}: {
  fdrId: string;
  actions: ScrutinyAction[];
  blockers: ApprovalBlocker[];
  assignedElsewhere: boolean;
  observations: ObservationItem[];
}) {
  const t = useTranslations("fdr.scrutiny");
  const locale = useLocale();
  const { run, busy } = useScrutinyAction(fdrId);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [severity, setSeverity] = useState("MEDIUM");
  const [successor, setSuccessor] = useState("");
  const [linkType, setLinkType] = useState("RENEWAL");
  const buttons = ONE_CLICK.filter((item) => actions.includes(item.action));
  const showBlockers = actions.includes("VERIFY_DOCUMENTS") || (blockers.length > 0 && actions.includes("SEND_BACK")) || (blockers.length > 0 && actions.includes("BANK_VERIFY") && !actions.includes("ACTIVATE") && !actions.includes("LINK_SUCCESSOR"));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("hint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {assignedElsewhere && <p className="rounded-lg bg-muted px-3 py-2 text-sm">{t("assignedElsewhere")}</p>}

        {buttons.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {buttons.map(({ action, icon: Icon, primary }) => (
              <Button key={action} variant={primary ? "default" : "outline"} disabled={busy !== null} onClick={() => void run({ action })}>
                {busy === action ? <Loader2 className="animate-spin" /> : <Icon />}
                {t(`actions.${action}`)}
              </Button>
            ))}
          </div>
        )}

        {actions.includes("BANK_VERIFY") && <p className="text-xs text-muted-foreground">{t("bankSimulated")}</p>}

        {showBlockers && blockers.length > 0 && (
          <div className="rounded-lg border border-dashed p-3 text-sm">
            <p className="font-medium">{t("blockedTitle")}</p>
            <ul className="mt-1 list-inside list-disc text-muted-foreground">
              {blockers.map((blocker) => <li key={blocker}>{t(`blockers.${blocker}`)}</li>)}
            </ul>
          </div>
        )}

        {actions.includes("RAISE") && (
          <form
            className="space-y-2 border-t pt-4"
            onSubmit={async (event) => {
              event.preventDefault();
              if (await run({ action: "RAISE", severity, message })) setMessage("");
            }}
          >
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <FlagTriangleRight className="size-4" aria-hidden />
              {t("raiseTitle")}
            </h3>
            <label htmlFor="raise-message" className="sr-only">{t("raiseMessage")}</label>
            <textarea id="raise-message" required minLength={5} maxLength={2000} rows={2} value={message} onChange={(event) => setMessage(event.target.value)} placeholder={t("raiseMessage")} className={TEXTAREA} />
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="raise-severity" className="text-sm">{t("severity")}</label>
              <select id="raise-severity" value={severity} onChange={(event) => setSeverity(event.target.value)} className={`${SELECT} w-auto`}>
                {["LOW", "MEDIUM", "HIGH"].map((value) => <option key={value} value={value}>{t(`severities.${value}`)}</option>)}
              </select>
              <Button type="submit" variant="outline" disabled={busy !== null}>{t("raise")}</Button>
            </div>
          </form>
        )}

        {actions.includes("LINK_SUCCESSOR") && (
          <form
            className="space-y-2 border-t pt-4"
            onSubmit={async (event) => {
              event.preventDefault();
              if (await run({ action: "LINK_SUCCESSOR", type: linkType, successorReference: successor })) setSuccessor("");
            }}
          >
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <GitBranch className="size-4" aria-hidden />
              {t("linkTitle")}
            </h3>
            <p className="text-xs text-muted-foreground">{t("linkHint")}</p>
            <div className="grid gap-2 sm:grid-cols-[auto_1fr_auto]">
              <label htmlFor="link-type" className="sr-only">{t("linkType")}</label>
              <select id="link-type" value={linkType} onChange={(event) => setLinkType(event.target.value)} className={SELECT}>
                <option value="RENEWAL">{t("linkRenewal")}</option>
                <option value="REPLACEMENT">{t("linkReplacement")}</option>
              </select>
              <label htmlFor="link-reference" className="sr-only">{t("linkReference")}</label>
              <Input id="link-reference" required value={successor} onChange={(event) => setSuccessor(event.target.value)} placeholder={t("linkReference")} className="uppercase placeholder:normal-case" />
              <Button type="submit" variant="outline" disabled={busy !== null}>{t("link")}</Button>
            </div>
          </form>
        )}

        {actions.includes("OBSERVE") && (
          <form
            className="space-y-2 border-t pt-4"
            onSubmit={async (event) => {
              event.preventDefault();
              if (await run({ action: "OBSERVE", note })) setNote("");
            }}
          >
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <MessageSquarePlus className="size-4" aria-hidden />
              {t("observeTitle")}
            </h3>
            <label htmlFor="observation" className="sr-only">{t("observeTitle")}</label>
            <textarea id="observation" required minLength={5} maxLength={2000} rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder={t("observePlaceholder")} className={TEXTAREA} />
            <Button type="submit" variant="outline" disabled={busy !== null}>{t("observe")}</Button>
          </form>
        )}

        {observations.length > 0 && (
          <div className="border-t pt-4">
            <h3 className="text-sm font-semibold">{t("observationsTitle")}</h3>
            <ul className="mt-2 space-y-2">
              {observations.map((item) => (
                <li key={item.id} className="rounded-lg bg-muted px-3 py-2 text-sm">
                  <p className="break-words">{item.note}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{item.officerName} · {formatDate(new Date(item.createdAt), locale)}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
