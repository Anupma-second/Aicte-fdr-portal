"use client";

import type { FdrStatus, TrustLevel } from "@prisma/client";
import { motion, useReducedMotion } from "framer-motion";
import { Loader2, Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { StatusChip } from "@/components/fdr/status-chip";
import { TrustBadge } from "@/components/fdr/trust-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Validity } from "@/lib/fdr/dates";
import { formatDate } from "@/lib/utils";
import { SectionHeading } from "./section-heading";

type TrackResult = {
  referenceNo: string;
  status: FdrStatus;
  trustLevel: TrustLevel;
  validity: Validity;
  lastUpdated: string;
};

const REFERENCE_PATTERN = /^FDR-\d{4}-\d{6}$/;

export function TrackWidget({ samples }: { samples: string[] }) {
  const t = useTranslations("landing.track");
  const locale = useLocale();
  const reduced = useReducedMotion();
  const [reference, setReference] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TrackResult | null>(null);
  const [error, setError] = useState<"format" | "notFound" | "limit" | "generic" | null>(null);

  async function lookup(value: string) {
    const referenceNo = value.trim().toUpperCase();
    setResult(null);
    if (!REFERENCE_PATTERN.test(referenceNo)) {
      setError("format");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const response = await fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referenceNo }),
      });
      if (response.ok) setResult(await response.json());
      else setError(response.status === 404 ? "notFound" : response.status === 429 ? "limit" : "generic");
    } catch {
      setError("generic");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section id="track" className="scroll-mt-20 px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-2xl">
        <SectionHeading eyebrow={t("eyebrow")} title={t("title")} subtitle={t("subtitle")} />
        <Card className="p-5 sm:p-6">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void lookup(reference);
            }}
            className="flex flex-col gap-2 sm:flex-row"
          >
            <label htmlFor="track-reference" className="sr-only">{t("label")}</label>
            <Input
              id="track-reference"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder="FDR-2026-000001"
              aria-invalid={error === "format"}
              className="h-11 uppercase placeholder:normal-case"
            />
            <Button type="submit" disabled={loading} className="h-11 sm:w-32">
              {loading ? <Loader2 className="animate-spin" /> : <Search />}
              {t("submit")}
            </Button>
          </form>

          {samples.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{t("try")}</span>
              {samples.map((sample) => (
                <button
                  key={sample}
                  type="button"
                  onClick={() => {
                    setReference(sample);
                    void lookup(sample);
                  }}
                  className="cursor-pointer rounded-full border bg-background px-2.5 py-1 font-medium tabular-nums transition-colors hover:bg-muted"
                >
                  {sample}
                </button>
              ))}
            </div>
          )}

          {error && (
            <p role="alert" className="mt-4 rounded-lg bg-status-red-bg px-3 py-2 text-sm text-status-red">
              {t(`errors.${error}`)}
            </p>
          )}

          {result && (
            <motion.div
              initial={reduced ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              aria-live="polite"
              className="mt-5 rounded-xl border bg-background/60 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold tabular-nums">{result.referenceNo}</p>
                <StatusChip status={result.status} />
              </div>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-muted-foreground">{t("result.trust")}</dt>
                  <dd className="mt-1"><TrustBadge level={result.trustLevel} /></dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t("result.validity")}</dt>
                  <dd className="mt-1 font-medium">{t(`validity.${result.validity}`)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t("result.updated")}</dt>
                  <dd className="mt-1 font-medium">{formatDate(new Date(result.lastUpdated), locale)}</dd>
                </div>
              </dl>
              <p className="mt-4 text-xs text-muted-foreground">{t("result.privacy")}</p>
            </motion.div>
          )}
        </Card>
      </div>
    </section>
  );
}
