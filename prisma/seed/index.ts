import { randomBytes } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";
import {
  Prisma,
  PrismaClient,
  type DiscrepancyType,
  type FdrEventType,
  type FdrStatus,
  type Institution,
  type Role,
  type TrustLevel,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import PDFDocument from "pdfkit";
import { appendAudit } from "../../src/lib/audit/chain";
import { addDays, daysUntil } from "../../src/lib/fdr/dates";
import { computeRisk } from "../../src/lib/fdr/risk";
import { getEnv } from "../../src/lib/env";
import { encodeText } from "../../src/lib/notifications/format";
import { getStorage } from "../../src/lib/storage";
import { BANKS, BRANCH_SUFFIXES, CONTACT_NAMES, NAME_PREFIXES, STATES, TYPE_NAMES } from "./data";
import { SeededRandom } from "./random";
import { SCENARIOS, type Scenario } from "./scenarios";

const db = new PrismaClient();
const random = new SeededRandom(26265);
const now = new Date();

const DEMO_PASSWORD = "Demo@12345";
const SEED_UPLOAD_PREFIX = "seed";
const INSTITUTION_COUNT = 40;
const PENDING_INSTITUTIONS = 3;

const DEMO_USERS: { email: string; name: string; role: Role }[] = [
  { email: "institution@demo.test", name: "Priya Institution (Demo)", role: "INSTITUTION" },
  { email: "officer@demo.test", name: "Rohan Officer (Demo)", role: "SCRUTINY_OFFICER" },
  { email: "authority@demo.test", name: "Meera Authority (Demo)", role: "COMPETENT_AUTHORITY" },
  { email: "admin@demo.test", name: "Arjun Admin (Demo)", role: "ADMIN" },
];

const DISCREPANCY_MESSAGES: Record<DiscrepancyType, string> = {
  DUPLICATE_FDR_NUMBER: "This FDR number is already on record for another institution.",
  AMOUNT_MISMATCH: "The declared amount does not match the amount read from the document.",
  MISSING_DOCUMENT: "The FDR scan has not been uploaded.",
  MATURITY_BEFORE_ISSUE: "The maturity date is earlier than the issue date.",
  BANK_MISMATCH: "The declared bank does not match the bank named on the document.",
  MISSING_FIELD: "The branch IFSC code is missing.",
  OTHER: "Other discrepancy.",
};

type AuditActor = { id: string | null; label: string };

async function audit(actor: AuditActor, action: string, entityType: string, entityId: string, payload: object = {}) {
  await db.$transaction((tx) =>
    appendAudit(tx, { actorId: actor.id, actorLabel: actor.label, action, entityType, entityId, payload }),
  );
}

async function resetDatabase() {
  // Children first, so foreign keys are satisfied.
  await db.loginAttempt.deleteMany();
  await db.bankVerificationLog.deleteMany();
  await db.escalationLog.deleteMany();
  await db.alertRule.deleteMany();
  await db.notification.deleteMany();
  await db.renewalLink.deleteMany();
  await db.releaseRequest.deleteMany();
  await db.scrutinyObservation.deleteMany();
  await db.discrepancy.deleteMany();
  await db.fdrEvent.deleteMany();
  await db.ocrExtraction.deleteMany();
  await db.fdrDocument.deleteMany();
  await db.fdr.deleteMany();
  await db.auditLog.deleteMany();
  await db.auditChainHead.deleteMany();
  await db.user.deleteMany();
  await db.institution.deleteMany();
  // The rows pointing at these files were just deleted, so the files would be orphans.
  for (const folder of [SEED_UPLOAD_PREFIX, "documents"]) {
    await rm(path.resolve(getEnv().UPLOAD_DIR, folder), { recursive: true, force: true });
  }
}

function samplePdf(lines: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ size: "A5", margin: 36 });
    const chunks: Buffer[] = [];
    pdf.on("data", (chunk: Buffer) => chunks.push(chunk));
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);
    pdf.fontSize(14).text("FIXED DEPOSIT RECEIPT");
    pdf.fontSize(9).fillColor("#b91c1c").text("SYNTHETIC SAMPLE FOR DEMONSTRATION. NOT A REAL INSTRUMENT.");
    pdf.moveDown().fillColor("#000000").fontSize(11);
    for (const line of lines) pdf.text(line);
    pdf.end();
  });
}

async function createInstitutions() {
  const institutions: Institution[] = [];
  for (let index = 0; index < INSTITUTION_COUNT; index += 1) {
    const place = STATES[index % STATES.length];
    const prefix = NAME_PREFIXES[index % NAME_PREFIXES.length];
    const kind = TYPE_NAMES[index % TYPE_NAMES.length];
    const city = random.pick(place.cities);
    institutions.push(
      await db.institution.create({
        data: {
          aicteCode: `SYN-${place.state.slice(0, 2).toUpperCase()}-${String(1000 + index)}`,
          name: `${prefix} ${kind.suffix}, ${city}`,
          type: kind.type,
          addressLine: `Campus Road, ${city}`,
          city,
          state: place.state,
          region: place.region,
          contactName: random.pick(CONTACT_NAMES),
          contactEmail: `contact${index + 1}@institutions.example.test`,
          contactPhone: `+91 90000 ${String(10000 + index)}`,
        },
      }),
    );
  }
  return institutions;
}

async function createUsers(institutions: Institution[]) {
  const demoHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  // Institution contacts own records but aren't demo logins, so their password is unguessable.
  const contactHash = await bcrypt.hash(randomBytes(32).toString("hex"), 10);

  const demo = {} as Record<Role, { id: string; email: string }>;
  for (const user of DEMO_USERS) {
    const created = await db.user.create({
      data: {
        email: user.email,
        name: user.name,
        role: user.role,
        status: "ACTIVE",
        passwordHash: demoHash,
        institutionId: user.role === "INSTITUTION" ? institutions[0].id : null,
      },
    });
    demo[user.role] = created;
    await audit({ id: null, label: "system:seed" }, "USER_SEEDED", "User", created.id, { role: user.role });
  }

  const contactByInstitution = new Map<string, string>([[institutions[0].id, demo.INSTITUTION.id]]);
  for (let index = 1; index < institutions.length; index += 1) {
    const institution = institutions[index];
    const pending = index >= institutions.length - PENDING_INSTITUTIONS;
    const user = await db.user.create({
      data: {
        email: institution.contactEmail!,
        name: institution.contactName ?? "Institution contact",
        role: "INSTITUTION",
        status: pending ? "PENDING_APPROVAL" : "ACTIVE",
        passwordHash: contactHash,
        institutionId: institution.id,
      },
    });
    contactByInstitution.set(institution.id, user.id);
    await audit({ id: null, label: "system:seed" }, "USER_SEEDED", "User", user.id, { role: "INSTITUTION" });
  }
  return { demo, contactByInstitution };
}

async function createAlertRules(adminId: string) {
  const rules = [
    ...[90, 60, 30, 7].map((days) => ({ kind: "REMINDER" as const, days, targetLevel: "INSTITUTION" as const })),
    { kind: "ESCALATION" as const, days: 1, targetLevel: "INSTITUTION" as const },
    { kind: "ESCALATION" as const, days: 7, targetLevel: "SCRUTINY_OFFICER" as const },
    { kind: "ESCALATION" as const, days: 15, targetLevel: "COMPETENT_AUTHORITY" as const },
  ];
  await db.alertRule.createMany({ data: rules.map((rule) => ({ ...rule, updatedById: adminId })) });
  await audit({ id: null, label: "system:seed" }, "ALERT_RULES_SEEDED", "AlertRule", "all", { count: rules.length });
}

type SeedFdrInput = {
  sequence: number;
  scenario: Scenario;
  scenarioIndex: number;
  institution: Institution;
  submittedById: string;
  officerId: string;
  authorityId: string;
  fdrNumber: string;
  status?: FdrStatus;
  trust?: TrustLevel;
  daysToMaturity?: number;
  discrepancy?: DiscrepancyType;
  bank?: (typeof BANKS)[number];
};

async function createFdr(input: SeedFdrInput) {
  const { scenario, institution, officerId, sequence } = input;
  const status = input.status ?? scenario.status;
  const trust = input.trust ?? scenario.trust;
  const discrepancy = input.discrepancy;

  const bank = input.bank ?? random.pick(BANKS);
  const branchName = `${institution.city} ${random.pick(BRANCH_SUFFIXES)}`;
  const amount = random.int(4, 80) * 50000;
  const daysToMaturity = input.daysToMaturity ?? random.int(scenario.maturity[0], scenario.maturity[1]);
  const termDays = random.int(365, 1825);

  const maturityDate = addDays(now, daysToMaturity);
  // A deliberately impossible date pair for the discrepancy engine to catch.
  const issueDate =
    discrepancy === "MATURITY_BEFORE_ISSUE" ? addDays(maturityDate, 30) : addDays(maturityDate, -termDays);

  // Verified cases go further back, so the turnaround trend has several months to show.
  const stillInReview = status === "SUBMITTED" || status === "UNDER_SCRUTINY" || status === "DISCREPANCY_RAISED";
  const submittedAt = addDays(now, -Math.min(random.int(2, stillInReview ? 60 : 200), Math.max(termDays - 1, 2)));
  const verified = !stillInReview;
  const missingScan = discrepancy === "MISSING_DOCUMENT";

  const risk = computeRisk({
    status,
    daysToMaturity,
    missingDocuments: missingScan ? 1 : 0,
    pastDelays: random.next() < 0.15 ? random.int(1, 2) : 0,
    openDiscrepancies: discrepancy ? 1 : 0,
    resolvedDiscrepancies: random.next() < 0.1 ? 1 : 0,
  });

  const fdr = await db.fdr.create({
    data: {
      referenceNo: `FDR-2026-${String(sequence).padStart(6, "0")}`,
      fdrNumber: input.fdrNumber,
      institutionId: institution.id,
      bankName: bank.name,
      branchName,
      ifscCode: discrepancy === "MISSING_FIELD" ? null : `${bank.ifscPrefix}0${String(random.int(100000, 999999))}`,
      amount,
      issueDate,
      maturityDate,
      status,
      trustLevel: trust,
      riskScore: risk.score,
      riskLevel: risk.level,
      riskReasons: risk.reasons as unknown as Prisma.InputJsonValue,
      submittedById: input.submittedById,
      assignedOfficerId: status === "SUBMITTED" ? null : officerId,
      submittedAt,
      verifiedAt: verified ? addDays(submittedAt, random.int(1, 10)) : null,
      slaDueAt: verified ? null : addDays(submittedAt, 14),
      statusChangedAt: addDays(submittedAt, 1),
    },
  });

  const events: { type: FdrEventType; title: string; actorId: string | null; occurredAt: Date }[] = [
    { type: "SUBMITTED", title: "FDR submitted", actorId: input.submittedById, occurredAt: submittedAt },
  ];

  if (!missingScan) {
    const pdf = await samplePdf([
      `FDR No: ${input.fdrNumber}`,
      `Bank: ${bank.name}`,
      `Branch: ${branchName}`,
      `Amount: Rs. ${amount}`,
      `Issue date: ${issueDate.toISOString().slice(0, 10)}`,
      `Maturity date: ${maturityDate.toISOString().slice(0, 10)}`,
    ]);
    const stored = await getStorage().put(`${SEED_UPLOAD_PREFIX}/${fdr.id}-scan-v1.enc`, pdf);
    // A few FDRs carry a superseded scan, so document versioning has something to show.
    const hasSecondVersion = input.scenarioIndex === 0 && scenario.status === "UNDER_SCRUTINY";
    const firstDoc = await db.fdrDocument.create({
      data: {
        fdrId: fdr.id,
        type: "FDR_SCAN",
        version: 1,
        isCurrent: !hasSecondVersion,
        originalName: `fdr-scan-${input.fdrNumber}.pdf`,
        mimeType: "application/pdf",
        uploadedById: input.submittedById,
        ...stored,
      },
    });
    events.push({
      type: "DOCUMENT_UPLOADED",
      title: "FDR scan uploaded",
      actorId: input.submittedById,
      occurredAt: submittedAt,
    });

    if (hasSecondVersion) {
      const secondStored = await getStorage().put(`${SEED_UPLOAD_PREFIX}/${fdr.id}-scan-v2.enc`, pdf);
      await db.fdrDocument.create({
        data: {
          fdrId: fdr.id,
          type: "FDR_SCAN",
          version: 2,
          originalName: `fdr-scan-${input.fdrNumber}-rescan.pdf`,
          mimeType: "application/pdf",
          uploadedById: input.submittedById,
          ...secondStored,
        },
      });
    }

    // Document values are stored apart from declared ones; a mismatch case differs here only.
    const extractedAmount = discrepancy === "AMOUNT_MISMATCH" ? amount - 50000 : amount;
    const extractedBank = discrepancy === "BANK_MISMATCH" ? BANKS.find((b) => b.name !== bank.name)!.name : bank.name;
    await db.ocrExtraction.create({
      data: {
        documentId: firstDoc.id,
        status: "COMPLETED",
        rawText: `FDR No ${input.fdrNumber} ${extractedBank} Amount ${extractedAmount}`,
        fdrNumber: input.fdrNumber,
        bankName: extractedBank,
        branchName,
        amount: extractedAmount,
        issueDate,
        maturityDate,
        confidence: 0.82 + random.next() * 0.16,
      },
    });
    events.push({ type: "OCR_RUN", title: "OCR extraction completed", actorId: null, occurredAt: submittedAt });
  }

  if (discrepancy) {
    await db.discrepancy.create({
      data: {
        fdrId: fdr.id,
        type: discrepancy,
        severity: discrepancy === "DUPLICATE_FDR_NUMBER" || discrepancy === "AMOUNT_MISMATCH" ? "HIGH" : "MEDIUM",
        source: "SYSTEM",
        field: discrepancy === "AMOUNT_MISMATCH" ? "amount" : discrepancy === "BANK_MISMATCH" ? "bankName" : null,
        declaredValue: discrepancy === "AMOUNT_MISMATCH" ? String(amount) : discrepancy === "BANK_MISMATCH" ? bank.name : null,
        extractedValue:
          discrepancy === "AMOUNT_MISMATCH"
            ? String(amount - 50000)
            : discrepancy === "BANK_MISMATCH"
              ? BANKS.find((b) => b.name !== bank.name)!.name
              : null,
        message: DISCREPANCY_MESSAGES[discrepancy],
      },
    });
    events.push({
      type: "DISCREPANCY_RAISED",
      title: "Discrepancy raised",
      actorId: null,
      occurredAt: addDays(submittedAt, 1),
    });
  }

  if (status === "UNDER_SCRUTINY" && input.scenarioIndex % 3 === 0) {
    await db.scrutinyObservation.create({
      data: { fdrId: fdr.id, officerId, note: "Documents received. Awaiting bank verification before sign-off." },
    });
    events.push({
      type: "OBSERVATION_ADDED",
      title: "Scrutiny observation added",
      actorId: officerId,
      occurredAt: addDays(submittedAt, 1),
    });
  }

  if (trust === "BANK_CONFIRMED") {
    await db.bankVerificationLog.create({
      data: {
        fdrId: fdr.id,
        result: "CONFIRMED",
        confirmedAmount: amount,
        confirmedMaturityDate: maturityDate,
        responsePayload: { simulated: true },
        requestedById: officerId,
      },
    });
    events.push({
      type: "BANK_VERIFICATION",
      title: "Bank verification confirmed (simulated)",
      actorId: officerId,
      occurredAt: addDays(submittedAt, 2),
    });
  }

  if (verified) {
    events.push({ type: "VERIFIED", title: "FDR verified", actorId: officerId, occurredAt: addDays(submittedAt, 3) });
  }

  const releaseStatuses = scenario.release;
  if (releaseStatuses) {
    const releaseStatus = releaseStatuses[input.scenarioIndex % releaseStatuses.length];
    const decided = releaseStatus === "APPROVED" || releaseStatus === "CLOSED";
    await db.releaseRequest.create({
      data: {
        fdrId: fdr.id,
        status: releaseStatus,
        reason: "Institution has completed the conditions for the deposit to be released.",
        requestedById: input.submittedById,
        decidedById: decided ? input.authorityId : null,
        decidedAt: decided ? addDays(now, -random.int(5, 40)) : null,
        closedAt: releaseStatus === "CLOSED" ? addDays(now, -random.int(1, 4)) : null,
        decisionNote: decided ? "All conditions met." : null,
      },
    });
    events.push({
      type: "RELEASE_REQUESTED",
      title: "Release requested",
      actorId: input.submittedById,
      occurredAt: addDays(submittedAt, 5),
    });
    if (decided) {
      events.push({ type: "RELEASED", title: "Deposit released", actorId: input.authorityId, occurredAt: addDays(now, -5) });
    }
    if (releaseStatus === "CLOSED") {
      events.push({ type: "CLOSED", title: "Case closed", actorId: input.authorityId, occurredAt: addDays(now, -1) });
    }
  }

  await db.fdrEvent.createMany({ data: events.map((event) => ({ ...event, fdrId: fdr.id })) });
  await audit({ id: input.submittedById, label: `seed:${institution.aicteCode}` }, "FDR_SEEDED", "Fdr", fdr.id, {
    referenceNo: fdr.referenceNo,
    status,
    trustLevel: trust,
  });
  return fdr;
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed: this script wipes data and must not run in production.");
  }

  console.log("Resetting database...");
  await resetDatabase();

  console.log("Creating institutions and users...");
  const institutions = await createInstitutions();
  const { demo, contactByInstitution } = await createUsers(institutions);
  await createAlertRules(demo.ADMIN.id);

  // The last few institutions are awaiting approval, so they hold no FDRs.
  const eligible = institutions.slice(0, institutions.length - PENDING_INSTITUTIONS);

  console.log("Creating FDRs and encrypted sample documents...");
  let sequence = 1;
  let numberCounter = 100000;
  const nextNumber = () => `${random.int(10, 99)}${numberCounter++}${random.int(100, 999)}`;
  const activeForDuplicates: { fdrNumber: string; institutionId: string; bankName: string }[] = [];
  const renewalPairs: { fdrId: string; institution: Institution; type: "RENEWAL" | "REPLACEMENT"; number: number }[] = [];
  const seeded: { scenario: Scenario; count: number }[] = [];

  // Active records come first so the duplicate-number cases have something to copy.
  const ordered = [...SCENARIOS].sort((a, b) => Number(b.status === "ACTIVE") - Number(a.status === "ACTIVE"));

  for (const scenario of ordered) {
    for (let scenarioIndex = 0; scenarioIndex < scenario.count; scenarioIndex += 1) {
      // Every scenario's first FDR goes to the demo institution, so its dashboard shows the full range.
      const institution =
        scenarioIndex === 0 ? institutions[0] : eligible[(sequence * 7 + scenarioIndex) % eligible.length];
      const discrepancy = scenario.discrepancy?.[scenarioIndex % scenario.discrepancy.length];

      let fdrNumber = nextNumber();
      let bank: (typeof BANKS)[number] | undefined;
      const isDuplicate = scenario.label === "discrepancy" && scenarioIndex < 4;
      if (isDuplicate) {
        const source = activeForDuplicates.find((candidate) => candidate.institutionId !== institution.id)!;
        activeForDuplicates.splice(activeForDuplicates.indexOf(source), 1);
        fdrNumber = source.fdrNumber;
        bank = BANKS.find((candidate) => candidate.name === source.bankName);
      }

      const fdr = await createFdr({
        sequence: sequence++,
        scenario,
        scenarioIndex,
        institution,
        submittedById: contactByInstitution.get(institution.id)!,
        officerId: demo.SCRUTINY_OFFICER.id,
        authorityId: demo.COMPETENT_AUTHORITY.id,
        fdrNumber,
        bank,
        discrepancy: isDuplicate ? "DUPLICATE_FDR_NUMBER" : discrepancy,
      });

      if (scenario.status === "ACTIVE") {
        activeForDuplicates.push({ fdrNumber, institutionId: institution.id, bankName: fdr.bankName });
      }
      if (scenario.status === "RENEWED" || scenario.status === "REPLACED") {
        renewalPairs.push({
          fdrId: fdr.id,
          institution,
          type: scenario.status === "RENEWED" ? "RENEWAL" : "REPLACEMENT",
          number: scenarioIndex,
        });
      }
    }
    seeded.push({ scenario, count: scenario.count });
  }

  console.log("Linking renewal chains...");
  const activeScenario = SCENARIOS.find((scenario) => scenario.status === "ACTIVE")!;
  for (const pair of renewalPairs) {
    const successor = await createFdr({
      sequence: sequence++,
      scenario: activeScenario,
      scenarioIndex: pair.number + 100,
      institution: pair.institution,
      submittedById: contactByInstitution.get(pair.institution.id)!,
      officerId: demo.SCRUTINY_OFFICER.id,
      authorityId: demo.COMPETENT_AUTHORITY.id,
      fdrNumber: nextNumber(),
    });
    await db.renewalLink.create({
      data: {
        oldFdrId: pair.fdrId,
        newFdrId: successor.id,
        type: pair.type,
        note: pair.type === "RENEWAL" ? "Renewed on maturity" : "Replaced with a new instrument",
      },
    });
    await db.fdrEvent.create({
      data: {
        fdrId: pair.fdrId,
        type: pair.type === "RENEWAL" ? "RENEWED" : "REPLACED",
        title: pair.type === "RENEWAL" ? "Renewed" : "Replaced",
        actorId: demo.SCRUTINY_OFFICER.id,
        metadata: { successorReference: successor.referenceNo },
      },
    });
    await audit({ id: demo.SCRUTINY_OFFICER.id, label: "officer@demo.test" }, "RENEWAL_LINK_SEEDED", "Fdr", pair.fdrId, {
      successor: successor.referenceNo,
      type: pair.type,
    });
  }

  console.log("Creating sample notifications...");
  const demoFdrs = await db.fdr.findMany({
    where: { institutionId: institutions[0].id, status: { in: ["EXPIRING", "MATURED", "DISCREPANCY_RAISED"] } },
  });
  for (const fdr of demoFdrs) {
    const days = daysUntil(fdr.maturityDate, now);
    const key = fdr.status === "DISCREPANCY_RAISED" ? "DISCREPANCY" : days < 0 ? "OVERDUE" : "REMINDER";
    const params = { reference: fdr.referenceNo, days: Math.abs(days) };
    await db.notification.create({
      data: {
        userId: demo.INSTITUTION.id,
        fdrId: fdr.id,
        kind: fdr.status === "DISCREPANCY_RAISED" ? "DISCREPANCY" : "REMINDER",
        title: encodeText(key, params),
        body: encodeText(`${key}_BODY`, params),
        link: `/fdrs/${fdr.id}`,
      },
    });
  }
  await db.notification.create({
    data: {
      userId: demo.ADMIN.id,
      kind: "ACCOUNT",
      title: encodeText("ACCOUNTS_WAITING", { count: PENDING_INSTITUTIONS }),
      body: encodeText("ACCOUNTS_WAITING_BODY", {}),
      link: "/admin",
    },
  });

  const counts = {
    institutions: await db.institution.count(),
    users: await db.user.count(),
    fdrs: await db.fdr.count(),
    documents: await db.fdrDocument.count(),
    discrepancies: await db.discrepancy.count(),
    renewalLinks: await db.renewalLink.count(),
    auditEntries: await db.auditLog.count(),
  };
  console.log("Seed complete:", counts);
  console.log(`Demo logins: ${DEMO_USERS.map((user) => user.email).join(", ")} / password: ${DEMO_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
