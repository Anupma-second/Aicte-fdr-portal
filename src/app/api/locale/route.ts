import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { LOCALE_COOKIE, LOCALES } from "@/i18n/request";
import { handler } from "@/lib/errors";

const schema = z.object({ locale: z.enum(LOCALES) });

export const POST = handler(async (request: NextRequest) => {
  const { locale } = schema.parse(await request.json());
  const response = NextResponse.json({ locale });
  response.cookies.set(LOCALE_COOKIE, locale, {
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
});
