import { existsSync } from "node:fs";
import path from "node:path";
import { db } from "@/lib/db";

/** Rough manual effort per FDR (tracking, letters, follow-ups). Shown as an estimate. */
export const HOURS_SAVED_PER_FDR = 6;

export type LandingData = {
  stats: { fdrs: number; institutions: number; alerts: number; hours: number };
  overview: { active: number; expiring: number; pending: number; discrepancies: number; matured: number; finished: number };
  sampleReferences: string[];
};

/** Aggregate counts and demo references only. Returns null so the page still renders without a database. */
export async function getLandingData(): Promise<LandingData | null> {
  try {
    const [byStatus, institutions, alerts, samples] = await Promise.all([
      db.fdr.groupBy({ by: ["status"], _count: { _all: true } }),
      db.institution.count(),
      db.notification.count(),
      Promise.all(
        (["ACTIVE", "EXPIRING", "DISCREPANCY_RAISED"] as const).map((status) =>
          db.fdr.findFirst({ where: { status }, orderBy: { referenceNo: "asc" }, select: { referenceNo: true } }),
        ),
      ),
    ]);
    const count = (...statuses: string[]) =>
      byStatus.filter((row) => statuses.includes(row.status)).reduce((sum, row) => sum + row._count._all, 0);
    const fdrs = count(...byStatus.map((row) => row.status));
    return {
      stats: { fdrs, institutions, alerts, hours: fdrs * HOURS_SAVED_PER_FDR },
      overview: {
        active: count("VERIFIED", "ACTIVE"),
        expiring: count("EXPIRING"),
        pending: count("SUBMITTED", "UNDER_SCRUTINY"),
        discrepancies: count("DISCREPANCY_RAISED"),
        matured: count("MATURED", "RELEASE_REQUESTED"),
        finished: count("RENEWED", "REPLACED", "RELEASED", "CLOSED"),
      },
      sampleReferences: samples.flatMap((sample) => (sample ? [sample.referenceNo] : [])),
    };
  } catch (error) {
    console.error("Landing data unavailable", error);
    return null;
  }
}

/** Returns the public path of an optional photo if someone has dropped it in. See public/images/README.md. */
export function optionalPhoto(name: string): string | null {
  return existsSync(path.join(process.cwd(), "public", "images", "photos", name)) ? `/images/photos/${name}` : null;
}
