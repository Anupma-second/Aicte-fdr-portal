"use client";

import type { Role } from "@prisma/client";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronDown, Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const KNOWN_ERRORS = [
  "INVALID_CREDENTIALS",
  "TOO_MANY_ATTEMPTS",
  "ACCOUNT_PENDING",
  "ACCOUNT_SUSPENDED",
  "ACCOUNT_REJECTED",
  "VALIDATION_ERROR",
];

type DemoProps = { accounts: readonly { role: Role; email: string }[]; password: string } | null;

/** Only same-site paths, so a crafted ?next= can't send someone to another website. */
function safeNextPath(next: string | null): string | null {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : null;
}

export function LoginForm({ demo }: { demo: DemoProps }) {
  const t = useTranslations("auth");
  const tRoles = useTranslations("roles");
  const router = useRouter();
  const searchParams = useSearchParams();
  const reduced = useReducedMotion();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: boolean; password?: boolean }>({});

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorCode(null);
    const errors = { email: !/^\S+@\S+\.\S+$/.test(email.trim()), password: password.length === 0 };
    setFieldErrors(errors);
    if (errors.email || errors.password) return;

    setLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const body = await response.json();
      if (!response.ok) {
        setErrorCode(KNOWN_ERRORS.includes(body.error?.code) ? body.error.code : "GENERIC");
        return;
      }
      router.replace(safeNextPath(searchParams.get("next")) ?? body.redirectTo);
      router.refresh();
    } catch {
      setErrorCode("GENERIC");
    } finally {
      setLoading(false);
    }
  }

  return (
    <motion.div
      className="w-full max-w-md"
      initial={reduced ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <h1 className="text-3xl font-semibold tracking-tight">{t("welcome")}</h1>
      <p className="mt-1.5 mb-6 text-sm text-muted-foreground">{t("welcomeHint")}</p>

      <Card className="p-6">
        <form onSubmit={submit} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="email" className="text-sm font-medium">{t("email")}</label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-invalid={fieldErrors.email}
              aria-describedby={fieldErrors.email ? "email-error" : undefined}
              className="h-11"
            />
            {fieldErrors.email && <p id="email-error" className="text-xs text-status-red">{t("validation.email")}</p>}
          </div>
          <div className="space-y-1.5">
            <label htmlFor="password" className="text-sm font-medium">{t("password")}</label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-invalid={fieldErrors.password}
                aria-describedby={fieldErrors.password ? "password-error" : undefined}
                className="h-11 pr-11"
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={t(showPassword ? "hidePassword" : "showPassword")}
                aria-pressed={showPassword}
                className="absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer rounded p-1.5 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            {fieldErrors.password && <p id="password-error" className="text-xs text-status-red">{t("validation.password")}</p>}
          </div>
          {errorCode && (
            <p role="alert" className="rounded-lg bg-status-red-bg px-3 py-2 text-sm text-status-red">
              {t(`errors.${errorCode}`)}
            </p>
          )}
          <Button type="submit" className="h-11 w-full" disabled={loading}>
            {loading && <Loader2 className="animate-spin" />}
            {t(loading ? "loggingIn" : "login")}
          </Button>
        </form>
      </Card>

      <p className="mt-5 text-center text-sm text-muted-foreground">
        {t("noAccount")}{" "}
        <Link href="/register" className="font-medium text-primary underline-offset-4 hover:underline">
          {t("register")}
        </Link>
      </p>

      {demo && (
        <details className="group mt-5 rounded-xl border bg-card/70 text-sm">
          <summary className="flex cursor-pointer list-none items-center gap-2 p-3 font-medium [&::-webkit-details-marker]:hidden">
            <KeyRound className="size-4 text-accent-foreground" aria-hidden />
            {t("demo.title")}
            <ChevronDown className="ml-auto size-4 transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <div className="px-3 pb-3">
            <p className="text-xs text-muted-foreground">{t("demo.hint", { password: demo.password })}</p>
            <ul className="mt-2 space-y-1">
              {demo.accounts.map((account) => (
                <li key={account.email}>
                  <button
                    type="button"
                    onClick={() => {
                      setEmail(account.email);
                      setPassword(demo.password);
                      setFieldErrors({});
                      setErrorCode(null);
                    }}
                    className="flex w-full cursor-pointer flex-wrap justify-between gap-x-3 rounded-lg px-2 py-1.5 text-left hover:bg-muted"
                  >
                    <span className="font-medium">{tRoles(account.role)}</span>
                    <span className="text-muted-foreground">{account.email}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </details>
      )}
    </motion.div>
  );
}
