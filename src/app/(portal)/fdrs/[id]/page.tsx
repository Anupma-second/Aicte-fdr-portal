import type { DocumentType } from "@prisma/client";
import { ArrowLeft, Pencil } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { DiscrepancyPanel } from "@/components/fdr/discrepancy-panel";
import { DocumentPanel } from "@/components/fdr/document-panel";
import { FdrComparison } from "@/components/fdr/fdr-comparison";
import { FdrTimeline } from "@/components/fdr/fdr-timeline";
import { ReleasePanel } from "@/components/fdr/release-panel";
import { RenewalChain } from "@/components/fdr/renewal-chain";
import { ScrutinyPanel } from "@/components/fdr/scrutiny-panel";
import { RiskDot } from "@/components/fdr/risk-dot";
import { StatusChip } from "@/components/fdr/status-chip";
import { TrustBadge } from "@/components/fdr/trust-badge";
import { ReassignCase } from "@/components/common/user-admin";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requirePageRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { daysUntil, getValidity } from "@/lib/fdr/dates";
import { getFdrDetail, getObservations, getRenewalChain } from "@/lib/fdr/queries";
import type { RiskReason } from "@/lib/fdr/risk";
import { CAN_REQUEST_RELEASE, releaseActions, releaseBlockers } from "@/lib/fdr/release-rules";
import { approvalBlockers, availableActions, type ScrutinyState } from "@/lib/fdr/scrutiny-rules";
import { canEditFdr, canUploadDocument } from "@/lib/fdr/service";
import { formatDate, formatInr } from "@/lib/utils";

const DOCUMENT_TYPES: DocumentType[] = ["FDR_SCAN", "COVERING_LETTER", "BANK_LETTER", "RENEWAL_PROOF", "RELEASE_APPLICATION", "OTHER"];

export default async function FdrDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageRole();
  const { id } = await params;
  const fdr = await getFdrDetail(user, id);
  const t = await getTranslations("fdr.detail");
  const tValidity = await getTranslations("landing.track.validity");
  const locale = await getLocale();

  const isInstitution = user.role === "INSTITUTION";
  const uploadableTypes = isInstitution ? DOCUMENT_TYPES.filter((type) => canUploadDocument(fdr.status, type)) : [];
  const currentScan = fdr.documents.find((doc) => doc.type === "FDR_SCAN" && doc.isCurrent);
  const days = daysUntil(fdr.maturityDate);
  const validity = getValidity(fdr.status, fdr.maturityDate);
  const isOfficer = user.role === "SCRUTINY_OFFICER";
  const chain = await getRenewalChain(fdr.id);
  // Officer notes are internal: they are only fetched for staff, so they never reach an institution's browser.
  const observations = isInstitution ? [] : await getObservations(fdr.id);
  const scrutinyState: ScrutinyState = {
    status: fdr.status,
    trustLevel: fdr.trustLevel,
    hasCurrentScan: Boolean(currentScan),
    openDiscrepancies: fdr.discrepancies.filter((item) => item.status === "OPEN").length,
    unresolvedDiscrepancies: fdr.discrepancies.filter((item) => item.status === "OPEN" || item.status === "RESPONDED").length,
    assignedToSomeoneElse: fdr.assignedOfficerId !== null && fdr.assignedOfficerId !== user.id,
  };
  const officerActions = isOfficer ? availableActions(scrutinyState) : [];
  const officers = user.role === "ADMIN" && !["CLOSED", "RELEASED"].includes(fdr.status)
    ? await db.user.findMany({ where: { role: "SCRUTINY_OFFICER", status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } })
    : null;
  const release = fdr.releaseRequests[0] ?? null;
  const openRelease = release && !["REJECTED", "CLOSED"].includes(release.status) ? release : null;
  const blockers = openRelease
    ? releaseBlockers(openRelease.status, {
        hasApplication: fdr.documents.some((doc) => doc.type === "RELEASE_APPLICATION" && doc.isCurrent),
        unresolvedDiscrepancies: scrutinyState.unresolvedDiscrepancies,
      })
    : [];

  return (
    <div className="space-y-6">
      <Link href="/fdrs" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden />
        {t("back")}
      </Link>

      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight tabular-nums">{fdr.referenceNo}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {fdr.bankName} · {fdr.branchName}
              {!isInstitution && ` · ${fdr.institution.name}`}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <StatusChip status={fdr.status} />
              <TrustBadge level={fdr.trustLevel} />
              <RiskDot level={fdr.riskLevel} score={fdr.riskScore} reasons={(fdr.riskReasons ?? []) as unknown as RiskReason[]} />
            </div>
          </div>
          {isInstitution && canEditFdr(fdr.status) && (
            <Button asChild variant="outline">
              <Link href={`/fdrs/${fdr.id}/edit`}>
                <Pencil />
                {t("edit")}
              </Link>
            </Button>
          )}
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-4 border-t pt-4 text-sm md:grid-cols-4">
          <div>
            <dt className="text-xs text-muted-foreground">{t("amount")}</dt>
            <dd className="mt-0.5 font-semibold">{formatInr(fdr.amount, locale)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t("maturity")}</dt>
            <dd className="mt-0.5 font-semibold">{formatDate(fdr.maturityDate, locale)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t("validity")}</dt>
            <dd className="mt-0.5 font-semibold">{tValidity(validity)}</dd>
          </div>
          {validity !== "FINISHED" && (
            <div>
              <dt className="text-xs text-muted-foreground">{t("countdown")}</dt>
              <dd className="mt-0.5 font-semibold tabular-nums">{days < 0 ? t("overdueBy", { days: -days }) : t("daysLeft", { days })}</dd>
            </div>
          )}
        </dl>
      </Card>

      <FdrComparison fdr={fdr} ocr={currentScan?.ocr ?? null} bank={fdr.bankVerifications[0] ?? null} />

      <div className="grid items-start gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="min-w-0 space-y-6">
          {officers && <ReassignCase fdrId={fdr.id} current={fdr.assignedOfficerId} officers={officers} />}
          <ReleasePanel
            fdrId={fdr.id}
            canRequest={isInstitution && CAN_REQUEST_RELEASE.includes(fdr.status)}
            actions={release ? releaseActions(release.status, user.role) : []}
            blockers={blockers}
            request={
              release && {
                id: release.id,
                status: release.status,
                reason: release.reason,
                requestedAt: release.requestedAt.toISOString(),
                decidedByName: release.decidedBy?.name ?? null,
                decisionNote: release.decisionNote,
              }
            }
          />
          {!isInstitution && (isOfficer || observations.length > 0) && (
            <ScrutinyPanel
              fdrId={fdr.id}
              actions={officerActions}
              blockers={approvalBlockers(scrutinyState)}
              assignedElsewhere={isOfficer && scrutinyState.assignedToSomeoneElse}
              observations={observations.map((item) => ({
                id: item.id,
                note: item.note,
                officerName: item.officer.name,
                createdAt: item.createdAt.toISOString(),
              }))}
            />
          )}
          <DiscrepancyPanel
            fdrId={fdr.id}
            canRespond={isInstitution}
            canReview={officerActions.includes("CLOSE_DISCREPANCY")}
            items={fdr.discrepancies.map((item) => ({
              id: item.id,
              type: item.type,
              severity: item.severity,
              status: item.status,
              source: item.source,
              message: item.message,
              declaredValue: item.declaredValue,
              extractedValue: item.extractedValue,
              response: item.response,
            }))}
          />
          <DocumentPanel
            fdrId={fdr.id}
            canUpload={uploadableTypes.length > 0}
            uploadableTypes={uploadableTypes}
            documents={fdr.documents.map((doc) => ({
              id: doc.id,
              type: doc.type,
              version: doc.version,
              isCurrent: doc.isCurrent,
              originalName: doc.originalName,
              mimeType: doc.mimeType,
              sizeBytes: doc.sizeBytes,
              uploadedByName: doc.uploadedBy.name,
              createdAt: doc.createdAt.toISOString(),
            }))}
          />
        </div>
        <div className="min-w-0 space-y-6">
          {chain.length > 1 && <RenewalChain chain={chain} currentId={fdr.id} />}
          <FdrTimeline events={fdr.events} />
        </div>
      </div>
    </div>
  );
}
