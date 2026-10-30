import { NextResponse, type NextRequest } from "next/server";
import { appendAudit } from "@/lib/audit/chain";
import { hashPassword } from "@/lib/auth/password";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { db } from "@/lib/db";
import { ApiError, handler } from "@/lib/errors";
import { registerSchema } from "@/lib/validation/auth";

const MAX_REGISTRATIONS = 20;

export const POST = handler(async (request: NextRequest) => {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  await consumeRateLimit("register", ip, MAX_REGISTRATIONS);
  const input = registerSchema.parse(await request.json());

  const [existingUser, existingInstitution] = await Promise.all([
    db.user.findUnique({ where: { email: input.email }, select: { id: true } }),
    db.institution.findUnique({ where: { aicteCode: input.aicteCode }, select: { id: true } }),
  ]);
  if (existingUser) throw new ApiError(409, "EMAIL_TAKEN", "An account with this email already exists");
  if (existingInstitution) throw new ApiError(409, "CODE_TAKEN", "This AICTE code is already registered");

  const passwordHash = await hashPassword(input.password);

  await db.$transaction(async (tx) => {
    const institution = await tx.institution.create({
      data: {
        aicteCode: input.aicteCode,
        name: input.institutionName,
        type: input.institutionType,
        city: input.city,
        state: input.state,
        region: input.region,
        contactName: input.name,
        contactEmail: input.email,
        contactPhone: input.phone,
      },
    });
    const user = await tx.user.create({
      data: {
        email: input.email,
        passwordHash,
        name: input.name,
        phone: input.phone,
        role: "INSTITUTION",
        status: "PENDING_APPROVAL",
        institutionId: institution.id,
      },
    });
    await appendAudit(tx, {
      actorId: user.id,
      actorLabel: user.email,
      action: "INSTITUTION_REGISTERED",
      entityType: "Institution",
      entityId: institution.id,
      payload: { aicteCode: institution.aicteCode, name: institution.name },
    });
  });

  return NextResponse.json({ status: "PENDING_APPROVAL" }, { status: 201 });
});
