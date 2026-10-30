"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const KNOWN_ERRORS = ["WRONG_PASSWORD", "SAME_PASSWORD", "TOO_MANY_ATTEMPTS", "VALIDATION_ERROR"];

export function PasswordForm() {
  const t = useTranslations("account");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (newPassword !== confirm) {
      setError("MISMATCH");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!response.ok) {
        const code = (await response.json()).error?.code;
        setError(KNOWN_ERRORS.includes(code) ? code : "GENERIC");
        return;
      }
      toast.success(t("changed"));
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
    } catch {
      setError("GENERIC");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="max-w-md space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="current-password" className="text-sm font-medium">{t("current")}</label>
        <Input id="current-password" type="password" required autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="new-password" className="text-sm font-medium">{t("new")}</label>
        <Input id="new-password" type="password" required minLength={10} autoComplete="new-password" aria-describedby="password-rule" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
        <p id="password-rule" className="text-xs text-muted-foreground">{t("rule")}</p>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="confirm-password" className="text-sm font-medium">{t("confirm")}</label>
        <Input id="confirm-password" type="password" required autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} />
      </div>
      {error && <p role="alert" className="rounded-lg bg-status-red-bg px-3 py-2 text-sm text-status-red">{t(`errors.${error}`)}</p>}
      <Button type="submit" disabled={busy}>
        {busy && <Loader2 className="animate-spin" />}
        {t("submit")}
      </Button>
    </form>
  );
}
