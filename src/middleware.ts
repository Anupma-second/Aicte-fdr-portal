import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/jwt";
import { ROLE_HOME, canAccessPath, isPublicPath } from "@/lib/rbac";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/** CSRF defence alongside SameSite=Lax: browsers always send Origin on these requests. */
function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");

  if (isApi && MUTATING_METHODS.has(request.method) && !isSameOrigin(request)) {
    return jsonError(403, "BAD_ORIGIN", "Cross-origin request rejected");
  }

  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);

  if (session && (pathname === "/login" || pathname === "/register")) {
    return NextResponse.redirect(new URL(ROLE_HOME[session.role], request.url));
  }
  if (isPublicPath(pathname)) return NextResponse.next();

  if (!session) {
    if (isApi) return jsonError(401, "UNAUTHENTICATED", "Please sign in");
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }

  if (!canAccessPath(session.role, pathname)) {
    if (isApi) return jsonError(403, "FORBIDDEN", "You don't have access to this");
    return NextResponse.redirect(new URL("/forbidden", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|images/|favicon.ico|icon.svg).*)"],
};
