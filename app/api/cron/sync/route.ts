import { NextResponse } from "next/server";
import { isChanged, runSyncOnce, prescorePending } from "@/lib/sync";

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
    // 先做廉价指纹比对：数据没变化则无需全量拉取，立即返回
    const changed = await isChanged();
    if (!changed) {
      return NextResponse.json({ ok: true, changed: false, note: "数据无变化，跳过全量同步" });
    }

    const r = await runSyncOnce();
    const p = await prescorePending(20).catch(() => ({ scored: 0, skipped: true }));
    return NextResponse.json({ ok: true, changed: true, created: r.created, updated: r.updated, total: r.total, prescored: p.scored });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}