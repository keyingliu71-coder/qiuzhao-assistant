"use client";

import { useEffect, useState } from "react";
import {
  aiResumeAdvice,
  aiInterviewQuestions,
  aiInterviewRecap,
  aiKnowledgeStatus,
} from "../actions";

const MODES = ["面试问题预测", "模拟面试", "复盘总结"];

type KStatus = Awaited<ReturnType<typeof aiKnowledgeStatus>> & { ok: true }; 

function esc(s: string): string {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function nl(s: string): string {
  return esc(s).replace(/\n/g, "<br/>");
}

function JobSelect({
  id,
  jobs,
}: {
  id: string;
  jobs: string[];
}) {
  const [val, setVal] = useState(jobs[0] || "");
  const [manual, setManual] = useState("");
  return (
    <div>
      <select
        id={id}
        className="sel"
        value={val}
        onChange={(e) => setVal(e.target.value)}
      >
        {jobs.length === 0 && (
          <option value="">投递看板暂无岗位 — 先去添加或手动输入</option>
        )}
        {jobs.map((j) => (
          <option key={j} value={j}>
            {j}
          </option>
        ))}
        <option value="__manual__">✏️ 手动输入岗位名</option>
      </select>
      {val === "__manual__" && (
        <input
          className="manual-job sel"
          style={{ marginTop: 8, display: "block", width: "100%" }}
          placeholder="输入公司 · 岗位，如：京东 · 解决方案岗"
          value={manual}
          onChange={(e) => setManual(e.target.value)}
        />
      )}
    </div>
  );
}

function KB({ ks }: { ks: KStatus | null }) {
  if (!ks) {
    return (
      <div className="note">
        <span className="hint">⏳ 正在读取知识底座状态…</span>
      </div>
    );
  }
  const chips = [
    { ok: ks.profile.ok, label: "候选人画像" },
    { ok: ks.scoring.ok, label: "评分标准" },
    { ok: ks.resumeSop.ok, label: "简历 SOP" },
    { ok: ks.interview.ok, label: "面试方法论" },
    { ok: ks.mianjing.ok, label: `面经库 ${ks.mianjing.count} 篇` },
    { ok: ks.memory.ok, label: "历史记忆" },
  ];
  return (
    <div
      className="note"
      style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}
    >
      <b style={{ marginRight: 4 }}>知识底座</b>
      {chips.map((c) => (
        <span
          key={c.label}
          style={{
            padding: "2px 10px",
            borderRadius: 999,
            fontSize: 12,
            background: c.ok ? "rgba(122,166,139,.16)" : "rgba(188,108,92,.16)",
            color: c.ok ? "var(--sage)" : "var(--rose)",
          }}
        >
          {c.ok ? "✓" : "✗"} {c.label}
        </span>
      ))}
      <span className="hint">
        {ks.mianjing.ok ? `面经更新：${ks.mianjing.mtime}` : "面经未同步"} · 本地知识目录：
        data/ai-knowledge/
      </span>
    </div>
  );
}

export default function AIClient({ jobs }: { jobs: string[] }) {
  const [cvOut, setCvOut] = useState<string>(
    "选择岗位后点击「生成定向简历」，这里将输出：命中证据、缺口、以及与母版的差异版本。"
  );
  const [ivOut, setIvOut] = useState<string>(
    "选择岗位与模式后点击「开始」，这里将输出：预测问题+建议回答 / 模拟评分 / 复盘结论。"
  );
  const [cvLoading, setCvLoading] = useState(false);
  const [ivLoading, setIvLoading] = useState(false);
  const [ivMode, setIvMode] = useState("面试问题预测");
  const [transcript, setTranscript] = useState("");
  const [kStatus, setKStatus] = useState<KStatus | null>(null);

  useEffect(() => {
    aiKnowledgeStatus().then((r) => {
      if (r.ok) setKStatus(r as KStatus);
    });
  }, []);

  function getJob(id: string): string {
    const sel = document.getElementById(id) as HTMLSelectElement | null;
    if (!sel) return "";
    if (sel.value === "__manual__") {
      return (
        (document.querySelector(".manual-job") as HTMLInputElement)?.value?.trim() || ""
      );
    }
    return sel.value;
  }

  async function runCv() {
    const job = getJob("cvJob");
    if (!job) return;
    setCvLoading(true);
    setCvOut("⏳ 正在调用模型生成定向简历建议…");
    const r = await aiResumeAdvice(job);
    setCvLoading(false);
    if (!r.ok) {
      setCvOut(`<span style="color:var(--rose)">${nl(r.msg)}</span>`);
      return;
    }
    setCvOut(
      `<h4>「${esc(job)}」· 定向简历修改建议</h4><div style="white-space:pre-wrap;line-height:1.7">${nl(
        r.text
      )}</div>`
    );
  }

  async function runIv() {
    const job = getJob("ivJob");
    if (!job) return;
    if (ivMode === "复盘总结" && !transcript.trim()) {
      setIvOut(`<span style="color:var(--rose)">请先粘贴真实面试转写文本。</span>`);
      return;
    }
    setIvLoading(true);
    setIvOut("⏳ 正在调用模型…");

    if (ivMode === "复盘总结") {
      const r = await aiInterviewRecap(transcript);
      setIvLoading(false);
      if (!r.ok) {
        setIvOut(`<span style="color:var(--rose)">${nl(r.msg)}</span>`);
        return;
      }
      const actions = (r.actions || [])
        .map((a) => `<li style="margin:4px 0">${nl(a)}</li>`)
        .join("");
      setIvOut(
        `<h4>「${esc(job)}」· 复盘总结</h4><div style="white-space:pre-wrap;line-height:1.7;margin-bottom:8px">${nl(
          r.conclusion
        )}</div><div class="lbl">行动项</div><ul style="padding-left:18px">${actions}</ul>`
      );
      return;
    }

    const r = await aiInterviewQuestions(job);
    setIvLoading(false);
    if (!r.ok) {
      setIvOut(`<span style="color:var(--rose)">${nl(r.msg)}</span>`);
      return;
    }
    const items = (r.items || [])
      .map(
        (it) =>
          `<div class="qa-item"><div class="q">${nl(it.q)}</div><div class="a">💡 ${nl(
            it.hint
          )}</div></div>`
      )
      .join("");
    const note =
      ivMode === "模拟面试"
        ? `<div class="hint" style="margin-top:8px;">交互式模拟面试为第二批能力；以下先给出预测问题供准备。</div>`
        : "";
    setIvOut(`<h4>「${esc(job)}」· ${esc(ivMode)}</h4>${items}${note}`);
  }

  return (
    <div className="page">
      <div className="toolbar">
        <h1 className="pagetitle" style={{ margin: 0 }}>
          AI 工作台
        </h1>
        <span style={{ flex: 1 }}></span>
        <span className="hint">2 个 Skill · 已接入真实大模型</span>
      </div>
      <KB ks={kStatus} />
      <div className="note">
        岗位来源：下拉框实时读取「投递看板」里的岗位；看板来自你点击「加入待投递」的岗位。无岗位时可手动输入。两个
        Skill 调用真实大模型，读取岗位 JD + 你的证据画像后输出。
      </div>
      <div className="ai-grid">
        <div className="panel skill-panel">
          <h3>📝 简历制作 Skill</h3>
          <span className="lbl">选择目标岗位</span>
          <JobSelect id="cvJob" jobs={jobs} />
          <span className="lbl" style={{ marginTop: 10 }}>
            简历母版
          </span>
          <select className="sel">
            <option>主简历 v3（母版）</option>
            <option>主简历 v2</option>
          </select>
          <span
            className="btn primary"
            style={{ marginTop: 12, cursor: "pointer", opacity: cvLoading ? 0.6 : 1 }}
            onClick={runCv}
          >
            {cvLoading ? "生成中…" : "✨ 生成定向简历"}
          </span>
          <div className="ai-out" dangerouslySetInnerHTML={{ __html: cvOut }} />
        </div>

        <div className="panel skill-panel">
          <h3>🎤 面试 Skill</h3>
          <span className="lbl">选择目标岗位</span>
          <JobSelect id="ivJob" jobs={jobs} />
          <span className="lbl" style={{ marginTop: 10 }}>
            模式
          </span>
          <select
            id="ivMode"
            className="sel"
            value={ivMode}
            onChange={(e) => setIvMode(e.target.value)}
          >
            {MODES.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
          {ivMode === "复盘总结" && (
            <textarea
              className="sel"
              style={{ width: "100%", minHeight: 90, marginTop: 10 }}
              placeholder="粘贴真实面试转写文本…"
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
            />
          )}
          <span
            className="btn primary"
            style={{ marginTop: 12, cursor: "pointer", opacity: ivLoading ? 0.6 : 1 }}
            onClick={runIv}
          >
            {ivLoading ? "调用中…" : "▶ 开始"}
          </span>
          <div className="ai-out" dangerouslySetInnerHTML={{ __html: ivOut }} />
        </div>
      </div>
    </div>
  );
}
