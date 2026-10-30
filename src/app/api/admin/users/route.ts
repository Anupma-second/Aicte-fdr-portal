import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { appendAudit } from "@/lib/audit/chain";
import { requireRole } from "@/lib/auth/guards";
import { hashPassword } from "@/lib/auth/password";
import { db } from "@/lib/db";
import { ApiError, handler } from "@/lib/errors";
import { adminCreateUserSchema } from "@/lib/validation/auth";

export const GET = handler(async () => {
  await requireRole("ADMIN");
  const users = await db.user.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      lastLoginAt: true,
      institution: { select: { name: true, aicteCode: true } },
    },
  });
  return NextResponse.json({ users });
});

/** Creates a staff account. Institutions register themselves. The password is shown once and never stored in clear. */
export const POST = handler(async (request: NextRequest) => {
  const admin = await requireRole("ADMIN");
  const input = adminCreateUserSchema.parse(await request.json());
  if (await db.user.findUnique({ where: { email: input.email }, select: { id: true } })) {
    throw new ApiError(409, "EMAIL_TAKEN", "An account with this email already exists");
  }

  const temporaryPassword = `${randomBytes(12).toString("base64url")}aA1`;
  const passwordHash = await hashPassword(temporaryPassword);
  const user = await db.$transaction(async (tx) => {
    const created = await tx.user.create({ data: { ...input, passwordHash, status: "ACTIVE" } });
    await appendAudit(tx, {
      actorId: admin.id,
      actorLabel: admin.email,
      action: "USER_CREATED",
      entityType: "User",
      entityId: created.id,
      payload: { email: created.email, role: created.role },
    });
    return created;
  });
  return NextResponse.json({ id: user.id, temporaryPassword }, { status: 201, headers: { "Cache-Control": "no-store" } });
});
