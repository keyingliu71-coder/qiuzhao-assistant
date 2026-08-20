# -*- coding: utf-8 -*-
"""生成 data/ai-knowledge/memory.md：历史产出索引（一次性导入用，同步脚本有等价逻辑）"""
import os, re, glob, datetime

web = r"C:/Users/26980/WorkBuddy/2026-08-17-14-55-41/web"
out_dir = os.path.join(web, "data/ai-knowledge/memory-src/outputs")
pre_dir = os.path.join(web, "data/ai-knowledge/memory-src/preflight")
skill_ws = r"C:/Users/26980/WorkBuddy/2026-08-17-14-55-41/.tmp-skill-inspect/lky-resume/lky-job-fit-resume-20260814_full_memory/workspace-generated"

# 1. outputs 文件名清单（来自 zip 解压目录）
docx = sorted([os.path.basename(p) for p in glob.glob(os.path.join(skill_ws, "outputs", "*.docx"))])

# 2. preflight 标题与要点
rows = []
for p in sorted(glob.glob(os.path.join(pre_dir, "*.md"))):
    text = open(p, encoding="utf-8").read()
    first = text.strip().splitlines()[0].lstrip("# ").strip() if text.strip() else os.path.basename(p)
    # 提取"唯一叙事主线"行
    m = re.search(r"唯一叙事主线[:：]\s*(.+)", text)
    mainline = m.group(1).strip() if m else ""
    # 提取"入选"经历
    picks = re.findall(r"入选[123][：:]\s*([^\n]+)", text)
    rows.append((first, mainline, picks))

lines = []
lines.append("# AI 工作台历史记忆（自动生成）")
lines.append("")
lines.append(f"> 生成时间：{datetime.datetime.now().strftime('%Y-%m-%d %H:%M')}；来源：lky-job-fit-resume skill 的 workspace-generated（zip 导出，2026-08-14 full_memory）")
lines.append("")
lines.append("本文件是简历/匹配 Skill 在 WorkBuddy 中长期调用的记忆索引。生成简历、评估岗位或给修改建议前，先查这里：")
lines.append("- 同公司/同岗位是否已做过定向简历 → 避免重复劳动，新建议要与此前结论一致（除非用户提供新材料）；")
lines.append("- 历史核验单记录的目标主线与经历筛选结论 → 复用，不重新发明。")
lines.append("")
lines.append(f"## 历史定向简历产出（{len(docx)} 份）")
lines.append("")
for d in docx:
    lines.append(f"- {d}")
lines.append("")
lines.append(f"## 历史简历核验单要点（{len(rows)} 份）")
lines.append("")
for first, mainline, picks in rows:
    lines.append(f"### {first}")
    if mainline:
        lines.append(f"- 叙事主线：{mainline}")
    if picks:
        lines.append(f"- 入选经历：{'；'.join(picks)}")
    lines.append("")

with open(os.path.join(web, "data/ai-knowledge/memory.md"), "w", encoding="utf-8") as f:
    f.write("\n".join(lines))
print("memory.md written:", len(lines), "lines,", len(docx), "docx,", len(rows), "preflight")
