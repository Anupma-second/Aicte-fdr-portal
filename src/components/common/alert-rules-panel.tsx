"use client";

import type { AlertRuleKind, EscalationLevel } from "@prisma/client";
import { Loader2, Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export type RuleItem = { id: string; kind: AlertRuleKind; days: number; targetLevel: EscalationLevel; isActive: boolean };

const SELECT = "flex h-10 rounded-lg border border-input bg-card px-3 text-sm";

export function AlertRulesPanel({ rules }: { rules: RuleItem[] }) {
  const t = useTranslations("alerts");
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [days, setDays] = useState("");
  const [kind, setKind] = useState<AlertRuleKind>("REMINDER");
  const [level, setLevel] = useState<EscalationLevel>("SCRUTINY_OFFICER");

  async function call(key: string, url: string, method: string, body?: object) {
    setBusy(key);
    try {
      const response = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const result = await response.json();
      if (!response.ok) {
        toast.error(t(result.error?.code === "RULE_EXISTS" ? "ruleExists" : result.error?.code === "VALIDATION_ERROR" ? "invalidDays" : "failed"));
        return null;
      }
      router.refresh();
      return result;
    } catch {
      toast.error(t("failed"));
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function runNow() {
    const summary = await call("run", "/api/admin/alerts/run", "POST");
    if (summary) toast.success(t("ran", { checked: summary.checked, reminders: summary.reminders, escalations: summary.escalations }));
  }

  function group(ruleKind: AlertRuleKind) {
    return rules
      .filter((rule) => rule.kind === ruleKind)
      .sort((a, b) => (ruleKind === "REMINDER" ? b.days - a.days : a.days - b.days))
      .map((rule) => (
        <li key={rule.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
          <span className={rule.isActive ? "" : "text-muted-foreground line-through"}>
            {ruleKind === "REMINDER" ? t("reminderRule", { days: rule.days }) : t("escalationRule", { days: rule.days, level: t(`levels.${rule.targetLevel}`) })}
          </span>
          <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void call(rule.id, `/api/admin/alert-rules/${rule.id}`, "PATCH", { isActive: !rule.isActive })}>
            {busy === rule.id && <Loader2 className="animate-spin" />}
            {t(rule.isActive ? "turnOff" : "turnOn")}
          </Button>
        </li>
      ));
  }

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("hint")}</CardDescription>
        </div>
        <Button variant="outline" disabled={busy !== null} onClick={() => void runNow()}>
          {busy === "run" ? <Loader2 className="animate-spin" /> : <Play />}
          {t("runNow")}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold">{t("reminders")}</h3>
            <ul className="divide-y">{group("REMINDER")}</ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold">{t("escalations")}</h3>
            <ul className="divide-y">{group("ESCALATION")}</ul>
          </div>
        </div>
        <form
          className="flex flex-wrap items-end gap-2 border-t pt-4"
          onSubmit={async (event) => {
            event.preventDefault();
            const result = await call("add", "/api/admin/alert-rules", "POST", { kind, days, targetLevel: kind === "REMINDER" ? "INSTITUTION" : level });
            if (result) setDays("");
          }}
        >
          <div className="space-y-1">
            <label htmlFor="rule-kind" className="text-xs font-medium">{t("addKind")}</label>
            <select id="rule-kind" value={kind} onChange={(event) => setKind(event.target.value as AlertRuleKind)} className={SELECT}>
              <option value="REMINDER">{t("reminders")}</option>
              <option value="ESCALATION">{t("escalations")}</option>
            </select>
          </div>
          <div className="w-24 space-y-1">
            <label htmlFor="rule-days" className="text-xs font-medium">{t("addDays")}</label>
            <Input id="rule-days" required type="number" min={1} max={365} value={days} onChange={(event) => setDays(event.target.value)} />
          </div>
          {kind === "ESCALATION" && (
            <div className="space-y-1">
              <label htmlFor="rule-level" className="text-xs font-medium">{t("addLevel")}</label>
              <select id="rule-level" value={level} onChange={(event) => setLevel(event.target.value as EscalationLevel)} className={SELECT}>
                {(["INSTITUTION", "SCRUTINY_OFFICER", "COMPETENT_AUTHORITY"] as const).map((value) => (
                  <option key={value} value={value}>{t(`levels.${value}`)}</option>
                ))}
              </select>
            </div>
          )}
          <Button type="submit" variant="outline" disabled={busy !== null}>{t("add")}</Button>
        </form>
      </CardContent>
    </Card>
  );
}
