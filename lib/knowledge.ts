// SERVER ONLY —— 知识底座加载器（data/ai-knowledge/）
// 供 lib/ai.ts 与 server actions 读取候选人画像/简历SOP/面试知识/面经快照/历史记忆。
// 带进程内缓存（mtime 变化自动失效）；文件缺失一律返回空串，调用方负责降级。
import { existsSync, readFileSync, statSync, readdirSync } from "fs";
import { join } from "path";

const ROOT = join(process.cwd(), "data", "ai-knowledge");
const cache = new Map<string, { mtimeMs: number; content: string }>();

function readK(rel: string): string {
  const p = join(ROOT, rel);
  try {
    if (!existsSync(p)) return "";
    const mtimeMs = statSync(p).mtimeMs;
    const hit = cache.get(p);
    if (hit && hit.mtimeMs === mtimeMs) return hit.content;
    const content = readFileSync(p, "utf8");
    cache.set(p, { mtimeMs, content });
    return content;
  } catch {
    return "";
  }
}

function clip(s: string, max: number): string {
  if (!s) return "";
  return s.length <= max ? s : s.slice(0, max) + "\n…（已截断）";
}

// —— 各知识块（带长度保护，按场景取用）——

/** 完整候选人事实库（profile.md） */
export function profileFull(max = 12000): string {
  return clip(readK("profile.md"), max);
}

/** 精简画像：教育与求职方向 + 实习标题，供高频批量预评分控成本 */
export function profileBrief(max = 2600): string {
  const full = readK("profile.md");
  if (!full) return "";
  // 取「教育与求职方向」整节 + 三段实习/项目的标题行
  const edu = full.match(/## 教育与求职方向[\s\S]*?(?=## )/)?.[0] || "";
  const heads = [...full.matchAll(/^### (.+)$/gm)].map((m) => m[1]).join("\n");
  return clip(`${edu}\n## 经历概览\n${heads}`, max);
}

/** 评分标准（scoring.md） */
export function scoringText(max = 4000): string {
  return clip(readK("scoring.md"), max);
}

/** 简历定制 SOP 要点（resume-sop.md） */
export function resumeSopText(max = 8000): string {
  return clip(readK("resume-sop.md"), max);
}

/** 面试方法论参考（interview/*）：答题手册、问题模式、个人案例、岗位类型、个人画像、来源索引 */
export function interviewRefs(max = 16000): string {
  const order = [
    "answer-playbook.md",
    "interview-patterns.md",
    "personal-cases.md",
    "role-types.md",
    "personal-profile.md",
    "source-index.md",
  ];
  let out = "";
  for (const f of order) {
    const t = readK(join("interview", f));
    if (!t) continue;
    out += `\n===== 参考文件：${f} =====\n${t}`;
  }
  return clip(out, max);
}

/** 面经精选（面试问题预测场景）：面试总控 + 能力诊断 + 个人题库 + 复盘说明 */
export function mianjingBrief(max = 20000): string {
  const parts = [
    ["00-面试总控.md", "00-面试总控"],
    ["04-能力诊断/四场面试综合诊断.md", "四场面试综合诊断"],
    ["02-个人题库/个人题库总览.md", "个人题库总览"],
    ["05-复盘/00-复盘说明.md", "复盘说明"],
  ];
  let out = "";
  for (const [rel, tag] of parts) {
    const t = readK(join("mianjing", rel));
    if (t) out += `\n===== 面经：${tag} =====\n${t}`;
  }
  return clip(out, max);
}

/** 复盘语料（面试复盘场景）：复盘说明 + 单场复盘模板 + 京东单场复盘示例 */
export function mianjingRecap(max = 14000): string {
  const parts = [
    ["05-复盘/00-复盘说明.md", "复盘说明"],
    ["06-模板/单场面试复盘模板.md", "单场复盘模板"],
    ["05-复盘/单场复盘/京东-解决方案/01-AI面复盘.md", "京东-AI面复盘示例"],
  ];
  let out = "";
  for (const [rel, tag] of parts) {
    const t = readK(join("mianjing", rel));
    if (t) out += `\n===== 面经：${tag} =====\n${t}`;
  }
  return clip(out, max);
}

/** 历史记忆索引（memory.md） */
export function memoryText(max = 8000): string {
  return clip(readK("memory.md"), max);
}

// —— 状态（供工作台展示知识底座是否就绪与更新时间）——
export interface KnowledgeStatus {
  ready: boolean;
  profile: { ok: boolean; mtime: string | null };
  scoring: { ok: boolean };
  resumeSop: { ok: boolean };
  interview: { ok: boolean };
  mianjing: { ok: boolean; count: number; mtime: string | null };
  memory: { ok: boolean };
}

export function knowledgeStatus(): KnowledgeStatus {
  const fmt = (rel: string): { ok: boolean; mtime: string | null } => {
    const p = join(ROOT, rel);
    try {
      if (!existsSync(p)) return { ok: false, mtime: null };
      return { ok: true, mtime: new Date(statSync(p).mtimeMs).toISOString().slice(0, 16).replace("T", " ") };
    } catch {
      return { ok: false, mtime: null };
    }
  };
  const mjDir = join(ROOT, "mianjing");
  let mjCount = 0;
  let mjMaxTs = 0;
  try {
    if (existsSync(mjDir)) {
      const walk = (d: string): number => {
        let n = 0;
        for (const e of readdirNames(d)) {
          const p = join(d, e.name);
          if (e.isDirectory()) n += walk(p);
          else if (e.name.endsWith(".md")) {
            n++;
            mjMaxTs = Math.max(mjMaxTs, statSync(p).mtimeMs);
          }
        }
        return n;
      };
      mjCount = walk(mjDir);
    }
  } catch {
    /* ignore */
  }
  return {
    ready: true,
    profile: fmt("profile.md"),
    scoring: fmt("scoring.md"),
    resumeSop: fmt("resume-sop.md"),
    interview: fmt("interview/answer-playbook.md"),
    mianjing: {
      ok: mjCount > 0,
      count: mjCount,
      mtime: mjMaxTs ? new Date(mjMaxTs).toISOString().slice(0, 16).replace("T", " ") : null,
    },
    memory: fmt("memory.md"),
  };
}

function readdirNames(d: string): { name: string; isDirectory(): boolean }[] {
  return readdirSync(d, { withFileTypes: true });
}
