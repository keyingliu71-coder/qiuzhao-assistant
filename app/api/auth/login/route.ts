import { NextResponse } from "next/server";
import { AUTH_COOKIE, makeSession, verifyLogin } from "@/lib/auth";

export async function POST(req: Request) {
  let body: { username?: unknown; password?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    /* 非法 JSON 视为空凭据 */
  }

  const username = String(body?.username ?? "");
  const password = String(body?.password ?? "");

  if (!verifyLogin(username, password)) {
    return NextResponse.json({ ok: false, error: "账号或密码不正确" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, makeSession(username), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}

export async function GET() {
  return NextResponse.json({ ok: false, error: "method not allowed" }, { status: 405 });
}