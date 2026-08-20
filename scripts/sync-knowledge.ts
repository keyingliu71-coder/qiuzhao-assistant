// 知识底座同步脚本：面经库快照 + 历史记忆索引
// 用法：npm run knowledge:sync   （可用环境变量覆盖源路径）
//   MIANJING_DIR=面经库根目录（默认 E:/软件/obsidian/面经/面经）
//   SKILL_WORKSPACE=简历 skill 的 workspace-generated 目录（默认引用 zip 解压目录；不存在则用 data/ai-knowledge/memory-src 回退）
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, copyFileSync, statSync } from "fs";
import { join, dirname, relative, basename } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = join(__dirname, "..");
const KNOW = join(WEB_ROOT, "data", "ai-knowledge");

const MIANJING_DIR = process.env.MIANJING_DIR || "E:/软件/obsidian/面经/面经";
const SKILL_WS = process.env.SKILL_WORKSPACE ||
  "C:/Users/26980/WorkBuddy/2026-08-17-14-55-41/.tmp-skill-inspect/lky-resume/lky-job-fit-resume-20260814_full_memory/workspace-generated";

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === ".obsidian") continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith(".md")) out.push(p);
  }
  return out;
}

function syncMianjing(): number {
  if (!existsSync(MIANJING_DIR)) {
    console.log(`[knowledge] 跳过面经库：目录不存在 ${MIANJING_DIR}`);
    return 0;
  }
  const dst = join(KNOW, "mianjing");
  let n = 0;
  for (const src of walk(MIANJING_DIR)) {
    const rel = relative(MIANJING_DIR, src);
    const dp = join(dst, rel);
    mkdirSync(dirname(dp), { recursive: true });
    copyFileSync(src, dp);
    n++;
  }
  console.log(`[knowledge] 面经库快照同步完成：${n} 个 md -> data/ai-knowledge/mianjing/`);
  return n;
}

function genMemory(): void {
  // outputs 文件名清单：优先从 skill workspace 读，否则用 memory-src 静态副本
  const outSrc = join(SKILL_WS, "outputs");
  const preSrc = existsSync(join(SKILL_WS, "preflight-checklists"))
    ? join(SKILL_WS, "preflight-checklists")
    : join(KNOW, "memory-src", "preflight");

  const docx: string[] = [];
  if (existsSync(outSrc)) {
    for (const f of readdirSync(outSrc)) {
      if (f.endsWith(".docx")) docx.push(f);
    }
  } else {
    // 回退：从静态索引读（skill 解压目录已被清理后仍可用）
    const idxSrc = join(KNOW, "memory-src", "outputs", "_index.txt");
    if (existsSync(idxSrc)) {
      for (const f of readFileSync(idxSrc, "utf8").split("\n")) {
        if (f.trim()) docx.push(f.trim());
      }
    }
  }
  docx.sort();

  const rows: { title: string; mainline: string; picks: string[] }[] = [];
  if (existsSync(preSrc)) {
    for (const f of readdirSync(preSrc).filter((x) => x.endsWith(".md")).sort()) {
      const text = readFileSync(join(preSrc, f), "utf8");
      const firstLine = text.trim().split("\n")[0].replace(/^#\s*/, "").trim() || basename(f);
      const m = text.match(/唯一叙事主线[:：]\s*(.+)/);
      const picks = [...text.matchAll(/入选[123][：:]\s*([^\n]+)/g)].map((x) => x[1].trim());
      rows.push({ title: firstLine, mainline: m ? m[1].trim() : "", picks });
    }
  }

  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const lines: string[] = [
    "# AI 工作台历史记忆（自动生成）",
    "",
    `> 生成时间：${stamp}；来源：lky-job-fit-resume skill 的 workspace-generated（zip 导出，2026-08-14 full_memory）`,
    "",
    "本文件是简历/匹配 Skill 在 WorkBuddy 中长期调用的记忆索引。生成简历、评估岗位或给修改建议前，先查这里：",
    "- 同公司/同岗位是否已做过定向简历 → 避免重复劳动，新建议要与此前结论一致（除非用户提供新材料）；",
    "- 历史核验单记录的目标主线与经历筛选结论 → 复用，不重新发明。",
    "",
    `## 历史定向简历产出（${docx.length} 份）`,
    "",
    ...docx.map((d) => `- ${d}`),
    "",
    `## 历史简历核验单要点（${rows.length} 份）`,
    "",
  ];
  for (const r of rows) {
    lines.push(`### ${r.title}`);
    if (r.mainline) lines.push(`- 叙事主线：${r.mainline}`);
    if (r.picks.length) lines.push(`- 入选经历：${r.picks.join("；")}`);
    lines.push("");
  }
  writeFileSync(join(KNOW, "memory.md"), lines.join("\n"), "utf8");
  console.log(`[knowledge] 记忆索引已生成：${docx.length} 份简历 / ${rows.length} 份核验单 -> data/ai-knowledge/memory.md`);
}

(async () => {
  mkdirSync(KNOW, { recursive: true });
  syncMianjing();
  genMemory();
  console.log("[knowledge] 完成。AI 工作台将在下次调用时自动读到最新知识。");
})().catch((e) => {
  console.error("[knowledge] 失败：", e);
  process.exit(1);
});
