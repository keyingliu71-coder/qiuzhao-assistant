import { NextResponse } from "next/server";
import { runSyncOnce, prescorePending } from "@/lib/sync";

// Vercel Cron 触发入口：每次调用执行一轮同步 + 顺带消化 AI 预评分队列
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // 简单的防滥用：校验 Vercel Cron 注入的专用请求头（如缺失则仅允许带正确 secret 的请求）
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const isVercelCron = req.headers.get("x-vercel-cron") === "1";

  if (secret && !isVercelCron && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  try {
    const r = await runSyncOnce();
    const p = await prescorePending(20).catch(() => ({ scored: 0, skipped: true }));
    return NextResponse.json({ ok: true, created: r.created, updated: r.updated, total: r.total, prescored: p.scored });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}