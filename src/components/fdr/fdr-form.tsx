"use client";

import { CircleAlert, FileCheck2, Info, Loader2, ScanText, Sparkles, UploadCloud } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { KNOWN_BANKS, type ExtractedFields } from "@/lib/fdr/parse-ocr";
import { cn } from "@/lib/utils";

const FIELDS = ["fdrNumber", "bankName", "branchName", "ifscCode", "amount", "issueDate", "maturityDate"] as const;
type FieldName = (typeof FIELDS)[number];
type Values = Record<FieldName, string>;

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPTED = ["application/pdf", "image/png", "image/jpeg"];
const KNOWN_API_ERRORS = ["DUPLICATE_OWN_FDR", "NOT_EDITABLE", "FILE_TOO_LARGE", "FILE_TYPE", "FILE_EMPTY", "VALIDATION_ERROR"];

function validate(values: Values): Partial<Record<FieldName, string>> {
  const errors: Partial<Record<FieldName, string>> = {};
  if (!/^[A-Za-z0-9][A-Za-z0-9/-]{3,39}$/.test(values.fdrNumber.trim())) errors.fdrNumber = "fdrNumber";
  if (values.bankName.trim().length < 2) errors.bankName = "required";
  if (values.branchName.trim().length < 2) errors.branchName = "required";
  if (values.ifscCode.trim() && !/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(values.ifscCode.trim())) errors.ifscCode = "ifscCode";
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(values.amount.trim()) || Number(values.amount) <= 0) errors.amount = "amount";
  if (!values.issueDate) errors.issueDate = "required";
  if (!values.maturityDate) errors.maturityDate = "required";
  return errors;
}

function sameValue(field: FieldName, a: string, b: string): boolean {
  if (field === "amount") return Number(a) === Number(b);
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

type FdrFormProps =
  | { mode: "new" }
  | { mode: "edit"; fdrId: string; initial: Values };

export function FdrForm(props: FdrFormProps) {
  const t = useTranslations("fdr.form");
  const tFields = useTranslations("fdr.fields");
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [values, setValues] = useState<Values>(
    props.mode === "edit"
      ? props.initial
      : { fdrNumber: "", bankName: "", branchName: "", ifscCode: "", amount: "", issueDate: "", maturityDate: "" },
  );
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [ocrFailed, setOcrFailed] = useState(false);
  const [extracted, setExtracted] = useState<ExtractedFields | null>(null);
  const [ocrToken, setOcrToken] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function update(field: FieldName, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors(({ [field]: _removed, ...rest }) => rest);
  }

  async function chooseFile(chosen: File | undefined) {
    setFileError(null);
    setOcrFailed(false);
    setExtracted(null);
    setOcrToken(null);
    if (!chosen) return;
    if (!ACCEPTED.includes(chosen.type)) {
      setFile(null);
      setFileError("FILE_TYPE");
      return;
    }
    if (chosen.size > MAX_BYTES) {
      setFile(null);
      setFileError("FILE_TOO_LARGE");
      return;
    }
    setFile(chosen);
    setScanning(true);
    try {
      const body = new FormData();
      body.set("file", chosen);
      const response = await fetch("/api/ocr", { method: "POST", body });
      const result = await response.json();
      if (!response.ok || result.status !== "COMPLETED") {
        setOcrFailed(true);
        if (response.ok) setOcrToken(result.token);
        return;
      }
      setOcrToken(result.token);
      const fields: ExtractedFields = result.fields;
      setExtracted(fields);
      // Fill only empty boxes, so nothing the user has typed gets overwritten.
      setValues((current) => {
        const next = { ...current };
        for (const field of FIELDS) {
          const value = fields[field];
          if (value && !next[field]) next[field] = value;
        }
        return next;
      });
      setErrors({});
    } catch {
      setOcrFailed(true);
    } finally {
      setScanning(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    const found = validate(values);
    setErrors(found);
    const first = Object.keys(found)[0];
    if (first) {
      document.getElementById(first)?.focus();
      return;
    }
    setSaving(true);
    try {
      let response: Response;
      if (props.mode === "edit") {
        response = await fetch(`/api/fdrs/${props.fdrId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        });
      } else {
        const body = new FormData();
        body.set("data", JSON.stringify(values));
        if (file) body.set("scan", file);
        if (ocrToken) body.set("ocrToken", ocrToken);
        response = await fetch("/api/fdrs", { method: "POST", body });
      }
      const result = await response.json();
      if (!response.ok) {
        setFormError(KNOWN_API_ERRORS.includes(result.error?.code) ? result.error.code : "GENERIC");
        return;
      }
      toast.success(t(props.mode === "edit" ? "saved" : "submitted"));
      router.push(`/fdrs/${result.id}`);
      router.refresh();
    } catch {
      setFormError("GENERIC");
    } finally {
      setSaving(false);
    }
  }

  const maturityNotAfterIssue = values.issueDate && values.maturityDate && values.maturityDate <= values.issueDate;

  function field(name: FieldName, type: string, extraProps: React.ComponentProps<"input"> = {}) {
    const scanned = extracted?.[name];
    const differs = Boolean(scanned && values[name] && !sameValue(name, values[name], scanned));
    const matches = Boolean(scanned && values[name] && !differs);
    return (
      <div className="space-y-1.5">
        <label htmlFor={name} className="flex flex-wrap items-center justify-between gap-1 text-sm font-medium">
          {tFields(name)}
          {matches && (
            <span className="inline-flex items-center gap-1 text-xs font-normal text-accent-foreground">
              <Sparkles className="size-3" aria-hidden />
              {t("fromScan")}
            </span>
          )}
        </label>
        <Input
          id={name}
          type={type}
          value={values[name]}
          onChange={(event) => update(name, event.target.value)}
          aria-invalid={Boolean(errors[name])}
          aria-describedby={errors[name] ? `${name}-error` : undefined}
          className={cn("h-11", differs && "border-status-amber")}
          {...extraProps}
        />
        {errors[name] && <p id={`${name}-error`} className="text-xs text-status-red">{t(`validation.${errors[name]}`)}</p>}
        {differs && (
          <p className="flex gap-1 text-xs text-status-amber">
            <CircleAlert className="mt-0.5 size-3 shrink-0" aria-hidden />
            {t("differs", { value: scanned ?? "" })}
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className={cn("grid gap-6", props.mode === "new" && "lg:grid-cols-[1fr_1.4fr]")}>
      {props.mode === "new" && (
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>{t("scanTitle")}</CardTitle>
            <CardDescription>{t("scanHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <label
              htmlFor="scan-file"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                void chooseFile(event.dataTransfer.files[0]);
              }}
              className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed bg-background/60 p-8 text-center transition-colors hover:border-primary"
            >
              {scanning ? (
                <Loader2 className="size-9 animate-spin text-primary" aria-hidden />
              ) : file ? (
                <FileCheck2 className="size-9 text-primary" aria-hidden />
              ) : (
                <UploadCloud className="size-9 text-muted-foreground" aria-hidden />
              )}
              <span className="text-sm font-medium break-all">{scanning ? t("scanning") : file ? file.name : t("chooseFile")}</span>
              <span className="text-xs text-muted-foreground">{t("fileRules")}</span>
            </label>
            <input
              ref={fileInput}
              id="scan-file"
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
              className="sr-only"
              onChange={(event) => void chooseFile(event.target.files?.[0])}
            />

            <div aria-live="polite">
              {fileError && <p className="mt-3 rounded-lg bg-status-red-bg px-3 py-2 text-sm text-status-red">{t(`errors.${fileError}`)}</p>}
              {ocrFailed && <p className="mt-3 rounded-lg bg-status-amber-bg px-3 py-2 text-sm text-status-amber">{t("ocrFailed")}</p>}
              {extracted && (
                <p className="mt-3 flex gap-2 rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground">
                  <ScanText className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {t("ocrDone")}
                </p>
              )}
            </div>

            <p className="mt-4 flex gap-2 text-xs text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {t("trustNote")}
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("detailsTitle")}</CardTitle>
          <CardDescription>{t("detailsHint")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {field("fdrNumber", "text", { autoComplete: "off", className: cn("h-11 uppercase") })}
            {field("amount", "text", { inputMode: "decimal", placeholder: "500000" })}
            {field("bankName", "text", { list: "bank-names", autoComplete: "off" })}
            {field("branchName", "text", { autoComplete: "off" })}
            {field("issueDate", "date")}
            {field("maturityDate", "date")}
            {field("ifscCode", "text", { autoComplete: "off", className: "h-11 uppercase" })}
          </div>
          <datalist id="bank-names">
            {KNOWN_BANKS.map((bank) => (
              <option key={bank} value={bank} />
            ))}
          </datalist>

          {maturityNotAfterIssue && (
            <p className="rounded-lg bg-status-amber-bg px-3 py-2 text-sm text-status-amber">{t("maturityWarning")}</p>
          )}
          {formError && (
            <p role="alert" className="rounded-lg bg-status-red-bg px-3 py-2 text-sm text-status-red">{t(`errors.${formError}`)}</p>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" className="h-11" onClick={() => router.back()}>{t("cancel")}</Button>
            <Button type="submit" className="h-11" disabled={saving || scanning}>
              {saving && <Loader2 className="animate-spin" />}
              {t(props.mode === "edit" ? "save" : "submit")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
