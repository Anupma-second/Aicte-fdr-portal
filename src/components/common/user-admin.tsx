"use client";

import type { Role, UserStatus } from "@prisma/client";
import { Copy, Loader2, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const STAFF_ROLES: Role[] = ["SCRUTINY_OFFICER", "COMPETENT_AUTHORITY", "ADMIN"];
const SELECT = "flex h-9 rounded-lg border border-input bg-card px-2 text-sm";

function useAdminCall() {
  const t = useTranslations("admin");
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function call(key: string, url: string, method: string, body: object, success?: string) {
    setBusy(key);
    try {
      const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) {
        const code = result.error?.code;
        toast.error(t(["EMAIL_TAKEN", "CANNOT_CHANGE_SELF", "ROLE_NOT_CHANGEABLE", "VALIDATION_ERROR", "NOT_AN_OFFICER"].includes(code) ? `errors.${code}` : "errors.GENERIC"));
        return null;
      }
      if (success) toast.success(success);
      router.refresh();
      return result;
    } catch {
      toast.error(t("errors.GENERIC"));
      return null;
    } finally {
      setBusy(null);
    }
  }
  return { call, busy };
}

export function PendingActions({ userId }: { userId: string }) {
  const t = useTranslations("admin");
  const { call, busy } = useAdminCall();
  const set = (status: UserStatus, success: string) => call(status, `/api/admin/users/${userId}`, "PATCH", { status }, success);
  return (
    <div className="flex gap-2">
      <Button size="sm" disabled={busy !== null} onClick={() => void set("ACTIVE", t("approved"))}>
        {busy === "ACTIVE" && <Loader2 className="animate-spin" />}
        {t("approve")}
      </Button>
      <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void set("REJECTED", t("rejected"))}>
        {busy === "REJECTED" && <Loader2 className="animate-spin" />}
        {t("reject")}
      </Button>
    </div>
  );
}

export function UserRowActions({ userId, role, status, isSelf }: { userId: string; role: Role; status: UserStatus; isSelf: boolean }) {
  const t = useTranslations("admin");
  const tRoles = useTranslations("roles");
  const { call, busy } = useAdminCall();
  if (isSelf) return <span className="text-xs text-muted-foreground">{t("you")}</span>;
  const url = `/api/admin/users/${userId}`;
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {role !== "INSTITUTION" && (
        <>
          <label htmlFor={`role-${userId}`} className="sr-only">{t("role")}</label>
          <select
            id={`role-${userId}`}
            value={role}
            disabled={busy !== null}
            onChange={(event) => void call("role", url, "PATCH", { role: event.target.value }, t("roleChanged"))}
            className={SELECT}
          >
            {STAFF_ROLES.map((value) => <option key={value} value={value}>{tRoles(value)}</option>)}
          </select>
        </>
      )}
      {status === "PENDING_APPROVAL" ? (
        <PendingActions userId={userId} />
      ) : status === "ACTIVE" ? (
        <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void call("status", url, "PATCH", { status: "SUSPENDED" }, t("suspended"))}>{t("suspend")}</Button>
      ) : (
        <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void call("status", url, "PATCH", { status: "ACTIVE" }, t("activated"))}>{t("activate")}</Button>
      )}
    </div>
  );
}

export function CreateStaffForm() {
  const t = useTranslations("admin");
  const tRoles = useTranslations("roles");
  const { call, busy } = useAdminCall();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("SCRUTINY_OFFICER");
  const [password, setPassword] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("createTitle")}</CardTitle>
        <CardDescription>{t("createHint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <form
          className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end"
          onSubmit={async (event) => {
            event.preventDefault();
            const result = await call("create", "/api/admin/users", "POST", { name, email, role });
            if (result) {
              setPassword(result.temporaryPassword);
              setName("");
              setEmail("");
            }
          }}
        >
          <div className="space-y-1">
            <label htmlFor="staff-name" className="text-xs font-medium">{t("name")}</label>
            <Input id="staff-name" required minLength={2} value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="space-y-1">
            <label htmlFor="staff-email" className="text-xs font-medium">{t("email")}</label>
            <Input id="staff-email" required type="email" autoComplete="off" value={email} onChange={(event) => setEmail(event.target.value)} />
          </div>
          <div className="space-y-1">
            <label htmlFor="staff-role" className="text-xs font-medium">{t("role")}</label>
            <select id="staff-role" value={role} onChange={(event) => setRole(event.target.value as Role)} className="flex h-10 rounded-lg border border-input bg-card px-2 text-sm">
              {STAFF_ROLES.map((value) => <option key={value} value={value}>{tRoles(value)}</option>)}
            </select>
          </div>
          <Button type="submit" disabled={busy !== null}>
            {busy === "create" ? <Loader2 className="animate-spin" /> : <UserPlus />}
            {t("create")}
          </Button>
        </form>
        {password && (
          <div role="status" className="rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground">
            <p>{t("passwordOnce")}</p>
            <p className="mt-1 flex flex-wrap items-center gap-2">
              <code className="font-mono font-semibold break-all">{password}</code>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  void navigator.clipboard?.writeText(password);
                  toast.success(t("copied"));
                }}
              >
                <Copy />
                {t("copy")}
              </Button>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ReassignCase({ fdrId, current, officers }: { fdrId: string; current: string | null; officers: { id: string; name: string }[] }) {
  const t = useTranslations("admin");
  const { call, busy } = useAdminCall();
  const [officerId, setOfficerId] = useState(current ?? "");
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("reassignTitle")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void call("assign", `/api/admin/fdrs/${fdrId}/assign`, "POST", { officerId }, t("reassigned"));
          }}
        >
          <div className="min-w-48 flex-1 space-y-1">
            <label htmlFor="assign-officer" className="text-xs font-medium">{t("officer")}</label>
            <select id="assign-officer" required value={officerId} onChange={(event) => setOfficerId(event.target.value)} className="flex h-10 w-full rounded-lg border border-input bg-card px-2 text-sm">
              <option value="">{t("chooseOfficer")}</option>
              {officers.map((officer) => <option key={officer.id} value={officer.id}>{officer.name}</option>)}
            </select>
          </div>
          <Button type="submit" variant="outline" disabled={busy !== null || !officerId || officerId === current}>
            {busy === "assign" && <Loader2 className="animate-spin" />}
            {t("reassign")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
