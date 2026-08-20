// 简化登录鉴权：账号密码 + 签名 cookie（生产公网防护）
// 用法：AUTH_USER / AUTH_PASS 环境变量（本地在 .env，Vercel 在环境变量）
import crypto from "crypto";

export const AUTH_COOKIE = "qz_auth";
const user = () => process.env.AUTH_USER || "Claire";
const pass = () => process.env.AUTH_PASS || "0602ayynjck";

function sig(username: string) {
  const secret = process.env.AUTH_SECRET || "dev-secret-change-me";
  return crypto
    .createHmac("sha256", secret)
    .update(username + ":" + user())
    .digest("hex");
}

export function verifyLogin(username: string, password: string) {
  return username === user() && password === pass();
}

export function makeSession(username: string) {
  return Buffer.from(JSON.stringify({ u: username, s: sig(username) })).toString("base64url");
}

export function isAuthed(tokenValue: string | undefined): boolean {
  if (!tokenValue) return false;
  try {
    const parsed = JSON.parse(Buffer.from(tokenValue, "base64url").toString());
    return parsed.u === user() && parsed.s === sig(parsed.u);
  } catch {
    return false;
  }
}