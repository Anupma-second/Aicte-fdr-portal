"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Check, CircleCheck, Eye, EyeOff, Loader2 } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { STATES, STATE_REGIONS } from "@/lib/india";
import { cn } from "@/lib/utils";

const INSTITUTION_TYPES = ["ENGINEERING", "MANAGEMENT", "PHARMACY", "ARCHITECTURE", "POLYTECHNIC", "OTHER"];
const SELECT_CLASS = "flex h-11 w-full rounded-lg border border-input bg-card px-3 text-sm";

const PASSWORD_RULES = [
  { key: "length", test: (value: string) => value.length >= 10 },
  { key: "lower", test: (value: string) => /[a-z]/.test(value) },
  { key: "upper", test: (value: string) => /[A-Z]/.test(value) },
  { key: "number", test: (value: string) => /[0-9]/.test(value) },
] as const;

type Values = Record<string, string>;

/** Same rules as the server's registerSchema, which remains the real check. */
function validate(values: Values): Record<string, string> {
  const errors: Record<string, string> = {};
  if (values.institutionName.trim().length < 3) errors.institutionName = "required";
  if (!/^[A-Za-z0-9-]{4,30}$/.test(values.aicteCode.trim())) errors.aicteCode = "aicteCode";
  if (values.city.trim().length < 2) errors.city = "required";
  if (!values.state) errors.state = "required";
  if (values.name.trim().length < 2) errors.name = "required";
  if (values.phone.trim() && !/^[0-9+\- ]{7,20}$/.test(values.phone.trim())) errors.phone = "phone";
  if (!/^\S+@\S+\.\S+$/.test(values.email.trim())) errors.email = "email";
  if (!PASSWORD_RULES.every((rule) => rule.test(values.password))) errors.password = "passwordRules";
  return errors;
}

export function RegisterForm() {
  const t = useTranslations("auth");
  const reduced = useReducedMotion();
  const [values, setValues] = useState<Values>({
    institutionName: "",
    aicteCode: "",
    institutionType: "ENGINEERING",
    city: "",
    state: "",
    name: "",
    phone: "",
    email: "",
    password: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function update(name: string, value: string) {
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => {
      const { [name]: _removed, ...rest } = current;
      return rest;
    });
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const found = validate(values);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      document.getElementById(Object.keys(found)[0])?.focus();
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, region: STATE_REGIONS[values.state] }),
      });
      if (response.ok) {
        setDone(true);
        return;
      }
      const body = await response.json();
      const code = body.error?.code;
      setFormError(code === "EMAIL_TAKEN" || code === "CODE_TAKEN" || code === "VALIDATION_ERROR" ? code : "GENERIC");
    } catch {
      setFormError("GENERIC");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <Card className="w-full max-w-md pb-6 text-center">
        <EmptyState icon={CircleCheck} title={t("registeredTitle")} description={t("registeredHint")} />
        <Button asChild>
          <Link href="/login">{t("login")}</Link>
        </Button>
      </Card>
    );
  }

  function field(name: string, type: string, autoComplete?: string, extra?: string) {
    return (
      <div className="space-y-1.5">
        <label htmlFor={name} className="text-sm font-medium">{t(`fields.${name}`)}</label>
        <Input
          id={name}
          type={type}
          autoComplete={autoComplete}
          value={values[name]}
          onChange={(event) => update(name, event.target.value)}
          aria-invalid={Boolean(errors[name])}
          aria-describedby={errors[name] ? `${name}-error` : undefined}
          className={cn("h-11", extra)}
        />
        {errors[name] && <p id={`${name}-error`} className="text-xs text-status-red">{t(`validation.${errors[name]}`)}</p>}
      </div>
    );
  }

  return (
    <motion.div
      className="w-full max-w-2xl"
      initial={reduced ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <h1 className="text-3xl font-semibold tracking-tight">{t("register")}</h1>
      <p className="mt-1.5 mb-6 text-sm text-muted-foreground">{t("registerHint")}</p>

      <Card className="p-6">
        <form onSubmit={submit} noValidate className="space-y-6">
          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-3 text-sm font-semibold">{t("sections.institution")}</legend>
            <div className="sm:col-span-2">{field("institutionName", "text", "organization")}</div>
            {field("aicteCode", "text", undefined, "uppercase")}
            <div className="space-y-1.5">
              <label htmlFor="institutionType" className="text-sm font-medium">{t("fields.institutionType")}</label>
              <select
                id="institutionType"
                value={values.institutionType}
                onChange={(event) => update("institutionType", event.target.value)}
                className={SELECT_CLASS}
              >
                {INSTITUTION_TYPES.map((value) => (
                  <option key={value} value={value}>{t(`institutionTypes.${value}`)}</option>
                ))}
              </select>
            </div>
            {field("city", "text", "address-level2")}
            <div className="space-y-1.5">
              <label htmlFor="state" className="text-sm font-medium">{t("fields.state")}</label>
              <select
                id="state"
                value={values.state}
                onChange={(event) => update("state", event.target.value)}
                aria-invalid={Boolean(errors.state)}
                aria-describedby={errors.state ? "state-error" : undefined}
                className={SELECT_CLASS}
              >
                <option value="">{t("fields.statePlaceholder")}</option>
                {STATES.map((state) => (
                  <option key={state} value={state}>{state}</option>
                ))}
              </select>
              {errors.state && <p id="state-error" className="text-xs text-status-red">{t("validation.required")}</p>}
            </div>
          </fieldset>

          <fieldset className="grid gap-4 border-t pt-5 sm:grid-cols-2">
            <legend className="mb-3 bg-card pr-2 text-sm font-semibold">{t("sections.contact")}</legend>
            {field("name", "text", "name")}
            {field("phone", "tel", "tel")}
            <div className="sm:col-span-2">{field("email", "email", "email")}</div>
            <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor="password" className="text-sm font-medium">{t("fields.password")}</label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={values.password}
                  onChange={(event) => update("password", event.target.value)}
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby="password-rules"
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
              <ul id="password-rules" className="grid gap-1 pt-1 text-xs sm:grid-cols-2">
                {PASSWORD_RULES.map((rule) => {
                  const met = rule.test(values.password);
                  return (
                    <li key={rule.key} className={cn("flex items-center gap-1.5", met ? "text-status-green" : errors.password ? "text-status-red" : "text-muted-foreground")}>
                      <Check className={cn("size-3.5", !met && "opacity-30")} aria-hidden />
                      {t(`passwordRules.${rule.key}`)}
                    </li>
                  );
                })}
              </ul>
            </div>
          </fieldset>

          {formError && (
            <p role="alert" className="rounded-lg bg-status-red-bg px-3 py-2 text-sm text-status-red">
              {t(`errors.${formError}`)}
            </p>
          )}

          <div className="flex flex-col-reverse items-center justify-between gap-3 sm:flex-row">
            <Link href="/login" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
              {t("haveAccount")}
            </Link>
            <Button type="submit" disabled={loading} className="h-11 w-full sm:w-auto">
              {loading && <Loader2 className="animate-spin" />}
              {t("register")}
            </Button>
          </div>
        </form>
      </Card>
    </motion.div>
  );
}
