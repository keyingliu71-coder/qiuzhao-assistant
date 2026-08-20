// SERVER ONLY —— 切勿在客户端组件（"use client"）中 import 本文件，否则 API Key 会泄露到浏览器。
// 客户端请通过 app/(app)/actions.ts 暴露的 server action 间接调用。
import { PROFILE } from "./match";
import {
  profileFull,
  profileBrief,
  scoringText,
  resumeSopText,
  interviewRefs,
  mianjingBrief,
  mianjingRecap,
  memoryText,
} from "./knowledge";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const BASE = (process.env.AI_BASE_URL || "https://api.deepseek.com").replace(/\/+$/, "");
const KEY = process.env.AI_API_KEY || "";
const MODEL = process.env.AI_MODEL || "deepseek-chat";
const DAILY_BUDGET = Number(process.env.AI_DAILY_BUDGET || "2000");

export function isAIConfigured(): boolean {
  return Boolean(KEY);
}

export function aiModelInfo() {
  return { base: BASE, model: MODEL, configured: isAIConfigured() };
}

// 候选人画像：优先用知识底座的完整事实库（data/ai-knowledge/profile.md），缺失时降级到 lib/match.ts 的 PROFILE
function profileText(): string {
  const k = profileFull();
  if (k) return k;
  return PROFILE.map((p) => `- ${p.tag}：${p.ev}`).join("\n");
}

// —— 每日预算与本地用量（单用户本地，存 JSON 文件）——
const USAGE_PATH = join(process.cwd(), ".ai-usage.json");
function todayKey() {
  return new Date().toISOString().slice(0, 10);
}
function readUsage(): { date: string; calls: number } {
  try {
    if (existsSync(USAGE_PATH)) {
      const j = JSON.parse(readFileSync(USAGE_PATH, "utf8"));
      if (j.date === todayKey()) return j;
    }
  } catch {
    /* ignore */
  }
  return { date: todayKey(), calls: 0 };
}
function addUsage() {
  const u = readUsage();
  u.calls += 1;
  try {
    writeFileSync(USAGE_PATH, JSON.stringify(u));
  } catch {
    /* ignore */
  }
}
export function aiUsage() {
  return readUsage();
}

interface ChatOpts {
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
}

async function chat(system: string, user: string, opts: ChatOpts = {}): Promise<string> {
  if (!KEY) throw new Error("AI 未配置：请在 .env 设置 AI_API_KEY（参照 .env.example）");
  const u = readUsage();
  if (u.calls >= DAILY_BUDGET) {
    throw new Error(`今日 AI 调用已达预算上限（${DAILY_BUDGET} 次），明日自动重置`);
  }

  const body: Record<string, unknown> = {
    model: MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: opts.temperature ?? 0.3,
    max_tokens: opts.maxTokens ?? 800,
  };
  if (opts.json) body.response_format = { type: "json_object" };

  const res = await fetch(`${BASE}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`AI 调用失败 HTTP ${res.status}：${txt.slice(0, 200)}`);
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data?.choices?.[0]?.message?.content ?? "";
  addUsage();
  return content;
}

function safeJson(raw: string): any {
  try {
    return JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        /* ignore */
      }
    }
  }
  return {};
}

function clampScore(n: unknown): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, v));
}

// 1) 批量预评分（首页驾驶舱「今日新开放岗位（含匹配度）」）
export async function prescoreCompany(c: {
  name: string;
  industry?: string | null;
  location?: string | null;
  positions?: string | null;
  target?: string | null;
  batch?: string | null;
}): Promise<{ score: number; summary: string; evidence: string[]; gaps: string[] }> {
  const system =
    "你是校招匹配预评分引擎。基于候选人事实库与岗位信息，给出 0-100 的匹配度分数、一句中文摘要(≤24字)、命中的候选人方向(数组)与缺口(数组)。只输出 JSON：{\"score\":int,\"summary\":string,\"evidence\":[string],\"gaps\":[string]}。客观保守，事实库无依据不打高分；学校不占优势时降低过筛预期；严禁编造候选人经历。";
  const user = `候选人事实库（精简）：\n${profileBrief()}\n\n评分标准：\n${scoringText(3000)}\n\n岗位公司：${c.name}\n行业：${c.industry || "-"}\n地点：${c.location || "-"}\n招聘对象：${c.target || "-"}\n岗位方向：${c.positions || "-"}\n批次：${c.batch || "-"}`;
  const raw = await chat(system, user, { json: true, temperature: 0.2, maxTokens: 500 });
  const j = safeJson(raw);
  return {
    score: clampScore(j.score),
    summary: String(j.summary || ""),
    evidence: Array.isArray(j.evidence) ? j.evidence.map(String).slice(0, 4) : [],
    gaps: Array.isArray(j.gaps) ? j.gaps.map(String).slice(0, 4) : [],
  };
}

// 2) JD 匹配评估（岗位工作台「JD与匹配」）
export async function evaluateMatch(input: {
  jobTitle: string;
  jdText: string;
}): Promise<{ score: number; evidence: string[]; gaps: string[] }> {
  const system =
    "你是简历匹配评估师。基于候选人事实库与岗位要求，给出 0-100 匹配度、命中的候选人优势证据(数组)、以及待补强的缺口(数组)。只输出 JSON：{\"score\":int,\"evidence\":[string],\"gaps\":[string]}。客观保守，证据必须能从事实库中找到；学校背景不占优势时如实反映过筛风险。";
  const user = `候选人事实库（完整）：\n${profileFull()}\n\n评分标准：\n${scoringText(4000)}\n\n岗位：${input.jobTitle}\n岗位要求/方向：\n${input.jdText || "-"}\n\n请逐条对照评估匹配度，列出命中证据（注明对应经历）与缺口。`;
  const raw = await chat(system, user, { json: true, temperature: 0.3, maxTokens: 600 });
  const j = safeJson(raw);
  return {
    score: clampScore(j.score),
    evidence: Array.isArray(j.evidence) ? j.evidence.map(String).slice(0, 5) : [],
    gaps: Array.isArray(j.gaps) ? j.gaps.map(String).slice(0, 5) : [],
  };
}

// 3) 简历修改建议（AI 工作台「简历制作 Skill」）
export async function resumeAdvice(input: {
  jobTitle: string;
  jdText: string;
}): Promise<string> {
  const system =
    "你是简历定制顾问。基于候选人事实库、简历定制 SOP 与历史记忆，给出该岗位定向简历的修改建议：突出哪些证据、弱化哪些、补哪些缺口、经历如何排序。用简体中文、分点输出，控制在 400 字内。严格遵守 SOP 红线（一页、身份四元组不缩写、不默认加自我评价、不编造经历）；若历史记忆显示该岗位已做过定向简历，说明可复用版本并只给增量修改建议。";
  const user = `候选人事实库：\n${profileFull()}\n\n简历定制 SOP 要点：\n${resumeSopText(8000)}\n\n历史记忆（是否做过该岗位）：\n${memoryText(4000)}\n\n目标岗位：${input.jobTitle}\n岗位要求/方向：\n${input.jdText || "-"}\n\n请给出定向简历修改建议。`;
  return chat(system, user, { temperature: 0.4, maxTokens: 700 });
}

// 4) 面试问题预测（AI 工作台「面试 Skill」）
export async function interviewQuestions(input: {
  jobTitle: string;
  jdText: string;
}): Promise<{ q: string; hint: string }[]> {
  const system =
    "你是面试教练。基于候选人真实经历、面试方法论、个人题库与面经，预测 4 个最可能被问到的问题，每个问题附一句回答思路提示（优先指向候选人已有真实案例，而不是泛泛而谈）。只输出 JSON：{\"items\":[{\"q\":string,\"hint\":string}]}。";
  const user = `候选人事实库：\n${profileFull(6000)}\n\n面试方法论与个人案例：\n${interviewRefs(12000)}\n\n面经与个人题库（含历史面试高频问题与 Gap）：\n${mianjingBrief(16000)}\n\n目标岗位：${input.jobTitle}\n岗位要求/方向：\n${input.jdText || "-"}\n\n预测面试问题，hint 引用候选人的真实经历。`;
  const raw = await chat(system, user, { json: true, temperature: 0.5, maxTokens: 700 });
  const j = safeJson(raw);
  const items = Array.isArray(j.items) ? j.items : [];
  return items.slice(0, 4).map((it: any) => ({ q: String(it?.q || ""), hint: String(it?.hint || "") }));
}

// 5) 面试复盘总结（AI 工作台「面试 Skill」）
export async function interviewRecap(transcript: string): Promise<{ conclusion: string; actions: string[] }> {
  const system =
    "你是面试复盘教练。基于真实转写，参考候选人的答题手册与历史复盘格式，总结表现结论，并给出可执行的改进行动项(数组)。只输出 JSON：{\"conclusion\":string,\"actions\":[string]}。客观、具体、可执行；对照候选人已知 Gap 判断本次是否进步，指出指标口径/个人归因/结构化表达等老问题是否再现。";
  const user = `面试答题方法论与历史复盘语料：\n${interviewRefs(6000)}\n${mianjingRecap(12000)}\n\n面试转写：\n${transcript || "-"}\n\n请总结复盘结论与行动项。`;
  const raw = await chat(system, user, { json: true, temperature: 0.3, maxTokens: 800 });
  const j = safeJson(raw);
  return {
    conclusion: String(j.conclusion || ""),
    actions: Array.isArray(j.actions) ? j.actions.map(String).slice(0, 6) : [],
  };
}

// 6) JD 结构化（M6 第一批能力，供后续详情页使用）
export async function structureJD(jd: string): Promise<{ responsibilities: string[]; requirements: string[]; tags: string[] }> {
  const system =
    "你是 HR 信息提取助手。把 JD 正文拆成：工作职责、任职要求、标签。只输出 JSON：{\"responsibilities\":[string],\"requirements\":[string],\"tags\":[string]}。";
  const user = `JD 正文：\n${jd || "-"}`;
  const raw = await chat(system, user, { json: true, temperature: 0.2, maxTokens: 800 });
  const j = safeJson(raw);
  return {
    responsibilities: Array.isArray(j.responsibilities) ? j.responsibilities.map(String).slice(0, 8) : [],
    requirements: Array.isArray(j.requirements) ? j.requirements.map(String).slice(0, 8) : [],
    tags: Array.isArray(j.tags) ? j.tags.map(String).slice(0, 8) : [],
  };
}
