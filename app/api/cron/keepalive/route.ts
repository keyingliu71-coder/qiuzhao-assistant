import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 心跳保活接口：只做一次廉价 SELECT 1，用于让 serverless Postgres(Neon) 计算节点保持 warm，
// 避免因 scale-to-zero 休眠导致"每次点击都冷启动 20~30s"。
// 用外部免费定时器（如 cron-job.org / UptimeRobot）每 5 分钟访问一次本 URL 即可。
// Vercel Hobby 的 Cron 每天仅 1 次，故不放在 vercel.json 里，改由外部定时触发。
export const dynamic = "force-dynamic";
// 仅一次极简查询，不需要长执行时限
export const maxDuration = 10;

export async function GET(req: Request) {
  // 可选 secret 校验：若配置了 CRON_SECRET，则要求带 Bearer；未配置则放行（本接口无任何数据返回风险）
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const isVercelCron = req.headers.get("x-vercel-cron") === "1";
  if (secret && !isVercelCron && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  try {
    await prisma.$queryRaw`SELECT 1`; // 唤醒/保持数据库连接
    return NextResponse.json({ ok: true, ts: Date.now() });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}