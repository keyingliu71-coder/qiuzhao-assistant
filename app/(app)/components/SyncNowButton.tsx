"use client";

import { useState } from "react";

// 首页「立即同步」按钮：手动触发 offerio 数据同步，无需等每日 cron
export default function SyncNowButton() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function syncNow() {
    if (busy) return;
    setBusy(true);
    setMsg("同步中…");
    try {
      const res = await fetch("/api/cron/sync", { method: "GET" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setMsg(data?.error || `HTTP ${res.status}`);
      } else if (data.changed === false) {
        setMsg("数据已是最新，无需同步 ✓");
      } else {
        setMsg(`已同步：新增 ${data.created ?? 0} / 更新 ${data.updated ?? 0} 家 ✓`);
        setTimeout(() => window.location.reload(), 600);
      }
    } catch {
      setMsg("同步失败，请稍后重试");
    }
    setBusy(false);
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span
        className="btn sm"
        style={{ cursor: busy ? "wait" : "pointer", color: "var(--dusty)", borderColor: "var(--line)" }}
        title="从 offerio 拉取最新岗位数据"
        onClick={syncNow}
      >
        {busy ? "同步中…" : "🔄 立即同步"}
      </span>
      {msg && <span className="hint">{msg}</span>}
    </span>
  );
}
