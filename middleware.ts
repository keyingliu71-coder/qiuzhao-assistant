import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, isAuthed } from "@/lib/auth";

// 公开访问（无需登录）
const PUBLIC_PREFIXES = ["/login", "/api/auth/login", "/favicon.ico"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  const token = req.cookies.get(AUTH_COOKIE)?.value;
  if (isAuthed(token)) {
    return NextResponse.next();
  }

  // 已登录用户访问 /login 直接进看板
  if (pathname === "/login") {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = "/login";
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};