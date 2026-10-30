"use client";

import { FlaskConical, Loader2, RotateCcw, ShieldAlert, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { ChainVerification } from "@/lib/audit/chain";

export function AuditIntegrityPanel({ canSimulate, activeEntry }: { canSimulate: boolean; activeEntry: string | null }) {
  const t = useTranslations("audit");
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<ChainVerification | null>(null);

  async function verify() {
    setBusy("verify");
    try {
      const response = await fetch("/api/audit/verify", { cache: "no-store" });
      if (!response.ok) throw new Error("verify failed");
      setResult(await response.json());
    } catch {
      toast.error(t("failed"));
    } finally {
      setBusy(null);
    }
  }

  async function simulate(action: "START" | "STOP") {
    setBusy(action);
    setResult(null);
    try {
      const response = await fetch("/api/audit/simulation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!response.ok) throw new Error("simulation failed");
      toast.success(t(action === "START" ? "simulationStarted" : "simulationEnded"));
      router.refresh();
    } catch {
      toast.error(t("failed"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h2 className="font-semibold">{t("integrityTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("integrityHint")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy !== null} onClick={() => void verify()}>
            {busy === "verify" ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
            {t("verify")}
          </Button>
          {canSimulate && !activeEntry && (
            <Button variant="outline" disabled={busy !== null} onClick={() => void simulate("START")}>
              {busy === "START" ? <Loader2 className="animate-spin" /> : <FlaskConical />}
              {t("simulate")}
            </Button>
          )}
          {activeEntry && canSimulate && (
            <Button variant="outline" disabled={busy !== null} onClick={() => void simulate("STOP")}>
              {busy === "STOP" ? <Loader2 className="animate-spin" /> : <RotateCcw />}
              {t("restore")}
            </Button>
          )}
        </div>
      </div>

      {activeEntry && (
        <p className="rounded-lg bg-status-amber-bg px-3 py-2 text-sm text-status-amber">
          {t("simulationActive", { entry: activeEntry })} {canSimulate ? t("simulationNext") : ""}
        </p>
      )}

      <div aria-live="polite">
        {result?.ok && (
          <p className="flex items-center gap-2 rounded-lg bg-status-green-bg px-3 py-2 text-sm font-medium text-status-green">
            <ShieldCheck className="size-4 shrink-0" aria-hidden />
            {t("intact", { count: result.checked })}
          </p>
        )}
        {result && !result.ok && (
          <div className="rounded-lg bg-status-red-bg px-3 py-2 text-sm text-status-red">
            <p className="flex items-center gap-2 font-semibold">
              <ShieldAlert className="size-4 shrink-0" aria-hidden />
              {t("broken")}
            </p>
            <p className="mt-1">{t(`reasons.${result.reason}`)}</p>
            <p className="mt-1">
              {t("checkedBefore", { count: result.checked })}{" "}
              {result.brokenAtId && (
                <Link href={`/audit?entry=${result.brokenAtId}`} className="font-medium underline underline-offset-2">
                  {t("showEntry", { entry: result.brokenAtId })}
                </Link>
              )}
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
