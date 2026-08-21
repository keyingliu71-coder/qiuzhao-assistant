"use client";

import { useState } from "react";
import { aiAddJob } from "@/app/(app)/actions";

// 投递看板「添加岗位」：粘贴投递/岗位描述 → DeepSeek 智能提取字段 → 入看板
export default function AddJobModal({
  onAdded,
}: {
  onAdded?: (company: string, jobTitle: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function run() {
    if (!text.trim() || loading) return;
    setLoading(true);
    setMsg(null);
    const r = await aiAddJob(text);
    setLoading(false);
    if (r.ok) {
      setMsg({ ok: true, text: r.msg });
      onAdded?.(r.company, r.jobTitle);
      setText("");
      setTimeout(() => setMsg(null), 3000);
      return;
    }
    setMsg({ ok: false, text: r.msg });
  }

  return (
    <>
      <button className="btn primary sm" onClick={() => setOpen(true)}>
        ＋ 添加岗位
      </button>
      {open && (
        <div
          className={"modal-mask open"}
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="modal in" style={{ maxWidth: 560 }}>
            <div className="modal-head">
              <h2>🤖 AI 智能录入岗位</h2>
              <span style={{ flex: 1 }}></span>
              <button className="close-btn" onClick={() => setOpen(false)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="hint" style={{ marginBottom: 8 }}>
                从求职平台复制岗位描述/投递信息（含公司、岗位、城市、链接），粘贴后 AI
                自动提取并录入「待投递」。
              </div>
              <textarea
                className="search-input"
                style={{ width: "100%", minHeight: 120, resize: "vertical", fontFamily: "inherit" }}
                placeholder={"例如：\n公司：小米\n岗位：AI数据产品经理\n地点：北京\n链接：https://...\n或直接粘贴完整 JD 描述"}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              <div className="row" style={{ marginTop: 10, gap: 8 }}>
                <button className="btn primary sm" onClick={run} disabled={loading}>
                  {loading ? "AI 解析中…" : "🤖 AI 识别并录入"}
                </button>
                <span className="btn sm" onClick={() => setOpen(false)}>
                  取消
                </span>
              </div>
              {msg && (
                <div
                  style={{
                    marginTop: 10,
                    color: msg.ok ? "var(--sage)" : "var(--rose)",
                    fontSize: 13,
                  }}
                >
                  {msg.ok ? "✅ " : "⚠️ "}
                  {msg.text}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}