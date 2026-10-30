"use client";

import type { DocumentType } from "@prisma/client";
import { CircleCheck, CircleDashed, Download, Eye, EyeOff, FileText, History, Loader2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";

export type DocumentItem = {
  id: string;
  type: DocumentType;
  version: number;
  isCurrent: boolean;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedByName: string;
  createdAt: string;
};

const TYPES: DocumentType[] = ["FDR_SCAN", "COVERING_LETTER", "BANK_LETTER", "RENEWAL_PROOF", "RELEASE_APPLICATION", "OTHER"];
const CHECKLIST: { type: DocumentType; required: boolean }[] = [
  { type: "FDR_SCAN", required: true },
  { type: "COVERING_LETTER", required: false },
];
const KNOWN_ERRORS = ["FILE_TOO_LARGE", "FILE_TYPE", "FILE_EMPTY", "UPLOAD_NOT_ALLOWED"];

function Preview({ doc, title }: { doc: DocumentItem; title: string }) {
  const url = `/api/documents/${doc.id}`;
  return doc.mimeType === "application/pdf" ? (
    <iframe src={url} title={title} className="mt-3 h-[28rem] w-full rounded-lg border bg-white" />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={title} className="mt-3 max-h-[28rem] w-full rounded-lg border bg-white object-contain" />
  );
}

export function DocumentPanel({
  fdrId,
  documents,
  canUpload,
  uploadableTypes,
}: {
  fdrId: string;
  documents: DocumentItem[];
  canUpload: boolean;
  uploadableTypes: DocumentType[];
}) {
  const t = useTranslations("fdr.documents");
  const locale = useLocale();
  const router = useRouter();
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [type, setType] = useState<DocumentType>(uploadableTypes[0] ?? "OTHER");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError("FILE_REQUIRED");
      return;
    }
    setError(null);
    setUploading(true);
    const form = event.currentTarget;
    try {
      const body = new FormData();
      body.set("type", type);
      body.set("file", file);
      const response = await fetch(`/api/fdrs/${fdrId}/documents`, { method: "POST", body });
      if (!response.ok) {
        const result = await response.json();
        setError(KNOWN_ERRORS.includes(result.error?.code) ? result.error.code : "GENERIC");
        return;
      }
      toast.success(t("uploaded"));
      form.reset();
      setFile(null);
      router.refresh();
    } catch {
      setError("GENERIC");
    } finally {
      setUploading(false);
    }
  }

  const current = documents.filter((doc) => doc.isCurrent);
  const older = documents.filter((doc) => !doc.isCurrent);

  function row(doc: DocumentItem) {
    const open = previewId === doc.id;
    return (
      <li key={doc.id} className="rounded-lg border bg-background/60 p-3">
        <div className="flex flex-wrap items-center gap-3">
          <FileText className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{t(`types.${doc.type}`)} · {t("version", { version: doc.version })}</p>
            <p className="truncate text-xs text-muted-foreground">
              {doc.originalName} · {Math.max(1, Math.round(doc.sizeBytes / 1024))} KB · {doc.uploadedByName} · {formatDate(new Date(doc.createdAt), locale)}
            </p>
          </div>
          <div className="flex gap-1">
            <Button type="button" variant="ghost" size="sm" aria-expanded={open} onClick={() => setPreviewId(open ? null : doc.id)}>
              {open ? <EyeOff /> : <Eye />}
              {t(open ? "hide" : "preview")}
            </Button>
            <Button asChild variant="ghost" size="sm">
              <a href={`/api/documents/${doc.id}?download=1`}>
                <Download />
                {t("download")}
              </a>
            </Button>
          </div>
        </div>
        {open && <Preview doc={doc} title={doc.originalName} />}
      </li>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <ul className="grid gap-2 sm:grid-cols-2">
          {CHECKLIST.map((item) => {
            const present = current.some((doc) => doc.type === item.type);
            return (
              <li key={item.type} className="flex items-center gap-2 text-sm">
                {present ? (
                  <CircleCheck className="size-4 text-status-green" aria-hidden />
                ) : (
                  <CircleDashed className={item.required ? "size-4 text-status-red" : "size-4 text-muted-foreground"} aria-hidden />
                )}
                {t(`types.${item.type}`)}
                <span className="text-xs text-muted-foreground">
                  ({t(present ? "present" : item.required ? "requiredMissing" : "optional")})
                </span>
              </li>
            );
          })}
        </ul>

        {current.length > 0 && <ul className="space-y-2">{current.map(row)}</ul>}

        {older.length > 0 && (
          <details className="group">
            <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium">
              <History className="size-4" aria-hidden />
              {t("history", { count: older.length })}
            </summary>
            <ul className="mt-2 space-y-2">{older.map(row)}</ul>
          </details>
        )}

        {canUpload && (
          <form onSubmit={upload} className="grid gap-3 border-t pt-4 sm:grid-cols-[1fr_1.4fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <label htmlFor="document-type" className="text-sm font-medium">{t("type")}</label>
              <select
                id="document-type"
                value={type}
                onChange={(event) => setType(event.target.value as DocumentType)}
                className="flex h-10 w-full rounded-lg border border-input bg-card px-3 text-sm"
              >
                {TYPES.filter((item) => uploadableTypes.includes(item)).map((item) => (
                  <option key={item} value={item}>{t(`types.${item}`)}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="document-file" className="text-sm font-medium">{t("file")}</label>
              <input
                id="document-file"
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                className="flex h-10 w-full cursor-pointer rounded-lg border border-input bg-card px-2 py-2 text-sm file:mr-2 file:border-0 file:bg-transparent file:text-sm file:font-medium"
              />
            </div>
            <Button type="submit" disabled={uploading}>
              {uploading ? <Loader2 className="animate-spin" /> : <Upload />}
              {t("upload")}
            </Button>
            {error && <p role="alert" className="text-sm text-status-red sm:col-span-3">{t(`errors.${error}`)}</p>}
            {type === "FDR_SCAN" && <p className="text-xs text-muted-foreground sm:col-span-3">{t("scanNote")}</p>}
          </form>
        )}
      </CardContent>
    </Card>
  );
}
