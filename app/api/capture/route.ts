import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { STAGE_NAMES } from "@/lib/constants";
import { isAIConfigured, parseJobInfo } from "@/lib/ai";

export const dynamic = "force-dynamic";

// CORS：允许 Chrome 扩展后台 Service Worker 跨域调用（MV3 带 host 权限通常已放开，这里兜底）
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, x-capture-key",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

// 扩展「一键收录」推送入口 —— 把任意来源投递的岗位实时落入平台看板
// 鉴权：请求头 x-capture-key 必须等于服务端 CAPTURE_KEY（生产应设置随机的强密钥）
// 复用平台已有能力：可选 AI 解析(parseJobInfo) 规范化 + 永远执行「公司+岗位」去重
type CaptureBody = {
  company?: unknown;
  jobTitle?: unknown;
  city?: unknown;
  sourceUrl?: unknown;
  stage?: unknown; // 扩展侧阶段文案，如 已投递 / Offer / 一面 ...
  applicationDate?: unknown;
  jdText?: unknown; // 页面原文，可选；AI 配置可用时用于规范化
};

export async function POST(req: Request) {
  const secret = process.env.CAPTURE_KEY;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "服务端未配置 CAPTURE_KEY，无法接收扩展推送（请在 .env / Vercel 设置）" },
      { status: 503, headers: corsHeaders() }
    );
  }
  if (req.headers.get("x-capture-key") !== secret) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403, headers: corsHeaders() });
  }

  let body: CaptureBody = {};
  try {
    body = (await req.json()) as CaptureBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400, headers: corsHeaders() });
  }

  const jobTitleRaw = String(body?.jobTitle ?? "").trim();
  if (!jobTitleRaw) {
    return NextResponse.json({ ok: false, error: "缺少岗位名(jobTitle)" }, { status: 400, headers: corsHeaders() });
  }

  try {
    const user = await prisma.user.findFirst();
    if (!user) {
      return NextResponse.json({ ok: false, error: "无用户" }, { status: 500, headers: corsHeaders() });
    }

    // —— 可选 AI 规范化（复用平台 parseJobInfo）——
    // 若配置了 AI 且提供了页面原文，用 DeepSeek 提取更规范的 公司/岗位/城市/链接；
    // 结构化字段优先（扩展已抓到的不为空则不覆盖），未配置 AI 时自动降级，不影响可用性。
    let ai: { company: string; jobTitle: string; city: string; link: string } | null = null;
    const jdText = String(body?.jdText ?? "").trim();
    if (isAIConfigured() && (jdText || jobTitleRaw)) {
      try {
        const p = await parseJobInfo(jdText || jobTitleRaw);
        ai = {
          company: String(p.company ?? "").trim(),
          jobTitle: String(p.jobTitle ?? "").trim(),
          city: String(p.city ?? "").trim(),
          link: String(p.link ?? "").trim(),
        };
      } catch {
        ai = null; // AI 失败不回退整个请求，继续用结构化字段
      }
    }

    const extCompany = String(body?.company ?? "").trim();
    const companyName = (extCompany || ai?.company || "未知公司").trim();
    const jobTitle = (jobTitleRaw || ai?.jobTitle || "待确认岗位").trim();
    const city = (String(body?.city ?? "").trim() || ai?.city || null) as string | null;
    const sourceUrl = (String(body?.sourceUrl ?? "").trim() || ai?.link || null) as string | null;

    // 平台口径：扩展「一键收录」即代表已提交，落为「个人投递」性质公司
    let company = await prisma.company.findFirst({ where: { name: companyName } });
    if (!company) {
      company = await prisma.company.create({
        data: { name: companyName, nature: "个人投递", location: city },
      });
    }

    // 去重：同一用户 · 同一公司 · 同一岗位 视为重复，绝不二次入库
    const dup = await prisma.application.findFirst({
      where: { userId: user.id, companyId: company.id, jobTitle },
    });
    if (dup) {
      return NextResponse.json({ ok: true, dup: true, msg: "该岗位已在平台看板中，跳过" }, { headers: corsHeaders() });
    }

    // 阶段映射：扩展阶段文案 → 平台 0-4 阶段 + 子状态（复用统一口径 SUB_STATE_OPTIONS 的取值）
    const stageText = String(body?.stage ?? "");
    let stage = 1; // 默认「已投未回」
    let subState = "已投未回";
    let subTone = "dusty";
    if (/offer|录用|待入职|已拿offer/i.test(stageText)) {
      stage = 4; subState = "已拿Offer"; subTone = "sage";
    } else if (/已结束|不合适|未通过|已拒绝|流程结束|已关闭|招聘结束/i.test(stageText)) {
      stage = 4; subState = "已被拒"; subTone = "dusty";
    } else if (/hr面|人事面/i.test(stageText)) {
      stage = 3; subState = "HR面"; subTone = "rose";
    } else if (/三面/i.test(stageText)) {
      stage = 3; subState = "三面"; subTone = "rose";
    } else if (/二面/i.test(stageText)) {
      stage = 3; subState = "二面"; subTone = "rose";
    } else if (/一面|初面/i.test(stageText)) {
      stage = 3; subState = "一面"; subTone = "rose";
    } else if (/笔试|测评/i.test(stageText)) {
      stage = 2; subState = "测评/AI面试中"; subTone = "sage";
    } else {
      stage = 1; subState = "已投未回"; subTone = "dusty";
    }

    const app = await prisma.application.create({
      data: {
        userId: user.id,
        companyId: company.id,
        jobTitle,
        stage,
        stageName: STAGE_NAMES[stage],
        subState,
        subTone,
        priority: "中",
        nextTodo: "用「简历制作 Skill」生成定向简历",
        sourceUrl,
      },
    });
    await prisma.applicationEvent.create({
      data: {
        applicationId: app.id,
        type: "扩展同步收录",
        toStage: stage,
        note: `来源于浏览器扩展「一键收录」：${companyName} · ${jobTitle}${sourceUrl ? " · " + sourceUrl : ""}`,
      },
    });

    revalidatePath("/board");
    revalidatePath("/dashboard");
    revalidatePath("/ai");

    return NextResponse.json(
      { ok: true, dup: false, msg: `已收录到平台：${companyName} · ${jobTitle}`, stage },
      { headers: corsHeaders() }
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500, headers: corsHeaders() });
  }
}