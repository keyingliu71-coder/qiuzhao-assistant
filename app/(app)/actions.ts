"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { STAGE_NAMES } from "@/lib/constants";
import {
  evaluateMatch,
  resumeAdvice,
  interviewQuestions,
  interviewRecap,
  isAIConfigured,
  parseJobInfo,
} from "@/lib/ai";
import { knowledgeStatus } from "@/lib/knowledge";

async function getDemoUser() {
  return prisma.user.findFirst();
}

// 加入待投递（公司弹窗 / 驾驶舱 新岗位）——companyId 可空，jobTitle 必填
export async function addToBoard(input: { companyId?: string | null; jobTitle: string }) {
  const user = await getDemoUser();
  if (!user) return { ok: false, msg: "无用户" };
  const jobTitle = (input.jobTitle || "").trim();
  if (!jobTitle) return { ok: false, msg: "缺少岗位名" };

  const existing = await prisma.application.findFirst({
    where: input.companyId
      ? { userId: user.id, companyId: input.companyId, jobTitle }
      : { userId: user.id, jobTitle },
  });
  if (existing) return { ok: false, msg: "已在看板中" };

  const app = await prisma.application.create({
    data: {
      userId: user.id,
      companyId: input.companyId || null,
      jobTitle,
      stage: 0,
      stageName: STAGE_NAMES[0],
      subState: "待评估",
      subTone: "gray",
      priority: "中",
      nextTodo: "用「简历制作 Skill」生成定向简历",
    },
  });
  await prisma.applicationEvent.create({
    data: { applicationId: app.id, type: "加入待投递", toStage: 0, note: "手动加入" },
  });
  revalidatePath("/board");
  revalidatePath("/dashboard");
  revalidatePath("/ai");
  return { ok: true, msg: "已加入待投递" };
}

// 看板拖拽改阶段
export async function updateStage(appId: string, stage: number) {
  const app = await prisma.application.findUnique({ where: { id: appId } });
  if (!app) return;
  const to = Math.max(0, Math.min(4, stage));
  if (app.stage === to) return;
  await prisma.application.update({
    where: { id: appId },
    data: { stage: to, stageName: STAGE_NAMES[to] },
  });
  await prisma.applicationEvent.create({
    data: { applicationId: appId, type: "状态变更", fromStage: app.stage, toStage: to },
  });
  revalidatePath("/board");
  revalidatePath("/dashboard");
  revalidatePath("/ai");
}

// 删除投递卡片（含关联待办、事件）
export async function delApplication(appId: string) {
  if (!appId) return { ok: false };
  await prisma.todo.deleteMany({ where: { applicationId: appId } });
  await prisma.applicationEvent.deleteMany({ where: { applicationId: appId } });
  await prisma.application.delete({ where: { id: appId } });
  revalidatePath("/board");
  revalidatePath("/dashboard");
  return { ok: true };
}

// 待办 CRUD（返回数据供前端即时刷新）
export async function addTodo(appId: string, text: string) {
  const t = (text || "").trim();
  if (!t) return null;
  const user = await getDemoUser();
  if (!user) return null;
  const todo = await prisma.todo.create({
    data: { applicationId: appId, userId: user.id, text: t, done: false },
  });
  revalidatePath("/board");
  return { id: todo.id, text: todo.text, done: todo.done };
}

export async function toggleTodo(todoId: string) {
  const todo = await prisma.todo.findUnique({ where: { id: todoId } });
  if (!todo) return null;
  const updated = await prisma.todo.update({
    where: { id: todoId },
    data: { done: !todo.done },
  });
  revalidatePath("/board");
  return { id: updated.id, done: updated.done };
}

export async function editTodo(todoId: string, text: string) {
  const t = (text || "").trim();
  if (!t) return;
  await prisma.todo.update({ where: { id: todoId }, data: { text: t } });
  revalidatePath("/board");
}

export async function delTodo(todoId: string) {
  await prisma.todo.delete({ where: { id: todoId } });
  revalidatePath("/board");
}

// 概览：优先级 / 满意度
export async function setPriority(appId: string, value: string) {
  await prisma.application.update({ where: { id: appId }, data: { priority: value } });
  revalidatePath("/board");
}
export async function setSatisfaction(appId: string, value: string) {
  await prisma.application.update({ where: { id: appId }, data: { satisfaction: value } });
  revalidatePath("/board");
}

// 证据库：确认"建议更新"（降级 defenseLevel），永不静默篡改
export async function applyEvidenceSuggestion(fact: string) {
  const user = await getDemoUser();
  if (!user) return { ok: false };
  const ev = await prisma.evidence.findFirst({
    where: { userId: user.id, fact: { contains: fact } },
  });
  if (!ev) return { ok: false };
  await prisma.evidence.update({
    where: { id: ev.id },
    data: { defenseLevel: "面试高风险", risk: "AI 面被追问口径不足（已确认降级）" },
  });
  revalidatePath("/library");
  return { ok: true };
}

// 公司招聘库「★ 收藏」——切换收藏状态，资料库「收藏」分区消费
export async function toggleFavorite(companyId: string) {
  const user = await getDemoUser();
  if (!user) return { ok: false, fav: false };
  const existing = await prisma.favorite.findUnique({
    where: { userId_companyId: { userId: user.id, companyId } },
  });
  if (existing) {
    await prisma.favorite.delete({ where: { id: existing.id } });
    revalidatePath("/library");
    return { ok: true, fav: false };
  }
  await prisma.favorite.create({ data: { userId: user.id, companyId } });
  revalidatePath("/library");
  return { ok: true, fav: true };
}

// —— AI 工作台 / 岗位工作台 的真实模型调用（密钥只在此服务端执行）——
function notCfg() {
  return { ok: false as const, msg: "AI 未配置：请在 .env 设置 AI_API_KEY（参照 .env.example）" };
}

// JD 匹配评估（工作台「JD与匹配」Tab，按 application 取真实岗位文本）
export async function aiEvaluateMatch(appId: string) {
  if (!isAIConfigured()) return notCfg();
  const app = await prisma.application.findUnique({
    where: { id: appId },
    include: { company: true },
  });
  if (!app) return { ok: false as const, msg: "未找到该岗位" };
  const jdText = [app.company?.positions, app.jobTitle].filter(Boolean).join("\n");
  try {
    const r = await evaluateMatch({ jobTitle: app.jobTitle, jdText });
    return { ok: true as const, ...r };
  } catch (e: unknown) {
    return { ok: false as const, msg: e instanceof Error ? e.message : String(e) };
  }
}

// 简历修改建议（AI 工作台「简历制作 Skill」）
export async function aiResumeAdvice(jobTitle: string) {
  if (!isAIConfigured()) return notCfg();
  try {
    const text = await resumeAdvice({ jobTitle, jdText: jobTitle });
    return { ok: true as const, text };
  } catch (e: unknown) {
    return { ok: false as const, msg: e instanceof Error ? e.message : String(e) };
  }
}

// 面试问题预测（AI 工作台「面试 Skill」）
export async function aiInterviewQuestions(jobTitle: string) {
  if (!isAIConfigured()) return notCfg();
  try {
    const items = await interviewQuestions({ jobTitle, jdText: jobTitle });
    return { ok: true as const, items };
  } catch (e: unknown) {
    return { ok: false as const, msg: e instanceof Error ? e.message : String(e) };
  }
}

// 面试复盘总结（AI 工作台「面试 Skill」）
export async function aiInterviewRecap(transcript: string) {
  if (!isAIConfigured()) return notCfg();
  try {
    const r = await interviewRecap(transcript);
    return { ok: true as const, ...r };
  } catch (e: unknown) {
    return { ok: false as const, msg: e instanceof Error ? e.message : String(e) };
  }
}

// 知识底座状态（AI 工作台展示：画像/面试知识/面经/历史记忆 是否就绪与更新时间）
export async function aiKnowledgeStatus() {
  const ks = knowledgeStatus();
  return { ok: true as const, ...ks };
}

// 巡检：标记已查（更新最近巡检时间，下次巡检 = +3 天）
export async function markChecked(appId: string) {
  await prisma.application.update({
    where: { id: appId },
    data: { lastCheckedAt: new Date() },
  });
  revalidatePath("/dashboard");
  revalidatePath("/board");
}


// 子状态（流程细分口径：流程前期[测评/AI面·笔试] / 流程后期[一面·二面·三面] / 结束[Offer·拒]）
export async function setSubState(appId: string, subState: string, subTone: string) {
  await prisma.application.update({ where: { id: appId }, data: { subState, subTone } });
  revalidatePath('/board');
  revalidatePath('/dashboard');
}

// AI 智能录入：粘贴投递/岗位描述 → DeepSeek 提取字段 → 入看板（待投递）
export async function aiAddJob(jdText: string) {
  if (!isAIConfigured())
    return { ok: false as const, msg: 'AI 未配置：请在 .env / Vercel 设置 AI_API_KEY（DeepSeek）后使用' };
  const text = (jdText || '').trim();
  if (!text) return { ok: false as const, msg: '请先粘贴岗位描述' };
  try {
    const info = await parseJobInfo(text);
    if (!info.jobTitle) return { ok: false as const, msg: '未能从描述中识别出岗位名，请补充信息或手动录入' };
    const user = await getDemoUser();
    if (!user) return { ok: false as const, msg: '无用户' };

    const companyName = info.company || '未知公司';
    let company = await prisma.company.findFirst({ where: { name: companyName } });
    if (!company)
      company = await prisma.company.create({
        data: { name: companyName, nature: '个人投递', location: info.city || null },
      });

    const dup = await prisma.application.findFirst({
      where: { userId: user.id, companyId: company.id, jobTitle: info.jobTitle },
    });
    if (dup) return { ok: false as const, msg: '该岗位已在看板中' };

    const app = await prisma.application.create({
      data: {
        userId: user.id,
        companyId: company.id,
        jobTitle: info.jobTitle,
        stage: 0,
        stageName: STAGE_NAMES[0],
        subState: '待评估',
        subTone: 'gray',
        priority: '中',
        nextTodo: '用「简历制作 Skill」生成定向简历',
        sourceUrl: info.link || null,
      },
    });
    await prisma.applicationEvent.create({
      data: { applicationId: app.id, type: 'AI 智能录入', toStage: 0, note: 'AI 从投递描述提取：' + companyName + ' · ' + info.jobTitle },
    });
    revalidatePath('/board');
    revalidatePath('/dashboard');
    return { ok: true as const, msg: '已添加：' + companyName + ' · ' + info.jobTitle, company: companyName, jobTitle: info.jobTitle };
  } catch (e: unknown) {
    return { ok: false as const, msg: e instanceof Error ? e.message : String(e) };
  }
}

