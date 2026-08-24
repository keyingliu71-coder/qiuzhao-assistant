import { NextResponse } from "next/server";
import { runSyncOnce, prescorePending } from "@/lib/sync";

// Vercel Cron 触发入口：每次调用执行一轮同步 + 顺带消化 AI 预评分队列
export const dynamic = "force-dynamic";
// 放宽执行时限：全量同步 3600+ 家可能需要数十秒
export const maxDuration = 60;

export async function GET(req: Request) {
  // 简单的防滥用：校验 Vercel Cron 注入的专用请求头（如缺失则仅允许带正确 secret 的请求）
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const isVercelCron = req.headers.get("x-vercel-cron") === "1";

  if (secret && !isVercelCron && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  try {
    // 每次调用都真正执行一轮同步（刷新最近 PAGE_LIMIT 页并纠正数据/签名），
    // 不依赖 isChanged 指纹短路，避免“签名看似最新、数据却陈旧”造成永久不同步。
    const r = await runSyncOnce();
    const p = await prescorePending(20).catch(() => ({ scored: 0, skipped: true }));
    return NextResponse.json({ ok: true, changed: true, created: r.created, updated: r.updated, total: r.total, prescored: p.scored });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}