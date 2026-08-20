"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markChecked } from "@/app/(app)/actions";

// 巡检队列：按投递时间顺序（先投递先巡检）展示待巡检岗位
// 「去官网查」打开官方应聘记录，「已查」更新 lastCheckedAt（下次 +3 天）

export type InspectItem = {
  id: string;
  companyName: string;
  jobTitle: string;
  sourceUrl?: string | null;
  appliedOn: string; // 投递日期 YYYY-MM-DD
  dueOn: string; // 本次应巡检日期
  overdueDays: number; // 逾期天数（0 = 今天到期）
  stageName: string;
  subState?: string | null;
};

export default function InspectionBlock({ items }: { items: InspectItem[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());

  function checkNow(id: string) {
    setDoneIds((s) => new Set(s).add(id));
    start(async () => {
      await markChecked(id);
      router.refresh();
    });
  }

  return (
    <div className="inspect-block">
      <div className="inspect-head">
        <span>
          🔍 巡检队列 <b>{items.length}</b>
        </span>
        <span className="hint">先投递先巡检 · 投递 3 天后开始 · 每 3 天一次</span>
      </div>
      {items.length === 0 && <div className="hint">暂无待巡检岗位，保持节奏 🌿</div>}
      {items.slice(0, 8).map((it) => {
        const done = doneIds.has(it.id);
        return (
          <div key={it.id} className={"inspect-item" + (done ? " done" : "")}>
            <div className="inspect-main">
              <span className="inspect-co">{it.companyName}</span>
              <span className="inspect-title">{it.jobTitle}</span>
              <span className="badge b-dusty">{it.stageName}</span>
            </div>
            <div className="inspect-meta">
              <span>投递 {it.appliedOn}</span>
              <span>
                {it.overdueDays > 0 ? (
                  <b className="inspect-late">逾期 {it.overdueDays} 天</b>
                ) : (
                  <b className="inspect-due">今天到期</b>
                )}
              </span>
            </div>
            <div className="inspect-ops">
              {it.sourceUrl ? (
                <a href={it.sourceUrl} target="_blank" rel="noopener" className="btn primary sm">
                  去官网查 ↗
                </a>
              ) : (
                <span className="hint" style={{ fontSize: 11 }}>
                  暂无官网链接
                </span>
              )}
              <button
                className="btn sm"
                disabled={done || pending}
                onClick={() => checkNow(it.id)}
              >
                {done ? "✓ 已查" : "已查"}
              </button>
            </div>
          </div>
        );
      })}
      {items.length > 8 && (
        <div className="hint" style={{ marginTop: 8 }}>
          还有 {items.length - 8} 条待巡检，按投递顺序依次处理即可。
        </div>
      )}
    </div>
  );
}
