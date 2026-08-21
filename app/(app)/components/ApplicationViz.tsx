"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

// 投递进度可视化（可交互版）：环形图 / 柱状图 / 明细列表
// 悬停查看详情，点击环形图扇区或柱形可筛选下方明细，点击明细行打开官方应聘记录

export type VizApp = {
  id: string;
  companyName: string;
  jobTitle: string;
  stage: number;
  subState?: string | null;
  subTone?: string | null;
  createdAt: string;
  sourceUrl?: string | null;
};

type SegKey = "waiting" | "progress" | "ended";
type Filter = "all" | SegKey | `day:${string}`;

const SEG_META: Record<SegKey, { label: string; color: string; dot: string }> = {
  waiting: { label: "已投递未推进", color: "#6f8a72", dot: "d-sage" },
  progress: { label: "有进展", color: "#5f7e98", dot: "d-dusty" },
  ended: { label: "已结束", color: "#b07e80", dot: "d-rose" },
};

const TONE_CLASS: Record<string, string> = {
  terra: "b-terra",
  sand: "b-sand",
  dusty: "b-dusty",
  sage: "b-sage",
  rose: "b-rose",
  gray: "b-gray",
};

function localDay(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function shortDay(iso: string) {
  return localDay(iso).slice(5).replace("-", ".");
}

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}
function donutArc(cx: number, cy: number, r: number, thick: number, a0: number, a1: number) {
  const large = a1 - a0 <= 180 ? 0 : 1;
  const p0 = polar(cx, cy, r, a0);
  const p1 = polar(cx, cy, r, a1);
  const p2 = polar(cx, cy, r - thick, a1);
  const p3 = polar(cx, cy, r - thick, a0);
  return `M${p0.x.toFixed(2)},${p0.y.toFixed(2)} A${r},${r} 0 ${large} 1 ${p1.x.toFixed(2)},${p1.y.toFixed(2)} L${p2.x.toFixed(2)},${p2.y.toFixed(2)} A${r - thick},${r - thick} 0 ${large} 0 ${p3.x.toFixed(2)},${p3.y.toFixed(2)} Z`;
}

export default function ApplicationViz({ apps, hideCharts = false, hideList = false }: { apps: VizApp[]; hideCharts?: boolean; hideList?: boolean }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);

  const stats = useMemo(() => {
    const delivered = apps.filter((a) => a.stage >= 1);
    const companies = new Set(delivered.map((a) => a.companyName)).size;
    const waiting = delivered.filter((a) => a.stage === 1);
    const progress = delivered.filter((a) => a.stage === 2 || a.stage === 3);
    const ended = delivered.filter((a) => a.stage === 4);
    const byDay = new Map<string, number>();
    for (const a of delivered) {
      const d = localDay(a.createdAt);
      byDay.set(d, (byDay.get(d) || 0) + 1);
    }
    const days = [...byDay.entries()].sort((x, y) => (x[0] < y[0] ? -1 : 1));
    const maxDay = Math.max(...days.map(([, n]) => n), 1);
    return { delivered, companies, waiting, progress, ended, days, maxDay };
  }, [apps]);

  const segs: SegKey[] = ["waiting", "progress", "ended"];
  const total = stats.delivered.length;

  const donut = useMemo(() => {
    if (total === 0) return null;
    let acc = 0;
    return segs.map((k) => {
      const c = stats[k].length;
      const a0 = acc;
      acc += (c / total) * 360;
      return { key: k, count: c, a0, a1: acc };
    });
  }, [stats, total]);

  const activeFilterKey = filter === "waiting" || filter === "progress" || filter === "ended" ? filter : null;

  const list = useMemo(() => {
    if (filter === "all") return [...apps].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    if (filter === "waiting" || filter === "progress" || filter === "ended") {
      return [...stats[filter]].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    }
    if (filter.startsWith("day:")) {
      const d = filter.slice(4);
      return apps.filter((a) => localDay(a.createdAt) === d);
    }
    return [];
  }, [apps, filter, stats]);

  function showTip(e: React.MouseEvent, text: string) {
    setTip({ x: e.clientX, y: e.clientY, text });
  }

  function openApp(a: VizApp) {
    if (a.sourceUrl) {
      window.open(a.sourceUrl, "_blank", "noopener");
    } else {
      alert("该岗位暂无官方链接，可到官网手动查询");
    }
  }

  const listTitle =
    filter === "all"
      ? `全部投递（${apps.length}）`
      : filter === "waiting" || filter === "progress" || filter === "ended"
        ? `${SEG_META[filter].label}（${stats[filter].length}）`
        : `${shortDay(filter.slice(4))} 投递`;

  return (
    <div className="viz-interactive">
      <div className="viz-filters">
        <span className={"chip" + (filter === "all" ? " on" : "")} onClick={() => setFilter("all")}>
          全部 {apps.length}
        </span>
        {segs.map((k) => (
          <span
            key={k}
            className={"chip" + (activeFilterKey === k ? " on" : "")}
            style={{ ["--chip" as string]: SEG_META[k].color }}
            onClick={() => setFilter(activeFilterKey === k ? "all" : k)}
          >
            <i className={`dot ${SEG_META[k].dot}`}></i>
            {SEG_META[k].label} {stats[k].length}
          </span>
        ))}
      </div>

      {!hideCharts && (
      <div className="viz-top">
        <div className="viz-card donut-card">
          <div className={"donut-interactive" + (activeFilterKey ? " has-filter" : "")}>
            <svg width="170" height="176" viewBox="0 0 160 176">
              {donut ? (
                donut.map((s) => (
                  <path
                    key={s.key}
                    d={donutArc(80, 88, 64, 30, s.a0, s.a1)}
                    fill={SEG_META[s.key].color}
                    className={"donut-seg" + (activeFilterKey === s.key ? " on" : "")}
                    style={{ transformOrigin: "80px 88px" }}
                    onMouseEnter={(e) =>
                      showTip(e, `${SEG_META[s.key].label} · ${s.count} 岗 · ${Math.round((s.count / total) * 100)}%`)
                    }
                    onMouseLeave={() => setTip(null)}
                    onClick={() => setFilter(activeFilterKey === s.key ? "all" : s.key)}
                  />
                ))
              ) : (
                <circle cx="80" cy="88" r="49" fill="none" stroke="#e6e2d9" strokeWidth="30" />
              )}
            </svg>
            <div className="donut-center">
              <b>{total}</b>
              <span>累计投递</span>
              <em>{stats.companies} 家</em>
            </div>
          </div>
          <div className="donut-legend">
            {segs.map((k) => (
              <span key={k}>
                <i className={`dot ${SEG_META[k].dot}`}></i>
                {SEG_META[k].label} <b>{stats[k].length}</b>
              </span>
            ))}
            <span className="hint" style={{ fontSize: 11 }}>
              💡 悬停扇区看占比，点击扇区筛选下方明细
            </span>
          </div>
        </div>

        <div className="viz-card">
          <h4>每日投递量（累计 {total} 岗）· 点柱子筛选当天</h4>
          <div className="barchart">
            {stats.days.map(([d, n]) => (
              <div
                key={d}
                className={"bar-col" + (filter === `day:${d}` ? " on" : "")}
                onMouseEnter={(e) => showTip(e, `${shortDay(d)} 投递 ${n} 岗`)}
                onMouseLeave={() => setTip(null)}
                onClick={() => setFilter(filter === `day:${d}` ? "all" : `day:${d}`)}
              >
                <div className="bar" style={{ height: `${Math.max((n / stats.maxDay) * 100, 8)}%` }}>
                  {n}
                </div>
                <div className="bar-label">{shortDay(d)}</div>
              </div>
            ))}
            {stats.days.length === 0 && <div className="hint">暂无投递数据</div>}
          </div>
        </div>
      </div>
      )}

      {!hideList && (
      <div className="viz-bottom">
        <div className="viz-card">
          <h4>
            {listTitle}
            <Link href="/board" className="more">
              进投递看板 →
            </Link>
          </h4>
          <div className="viz-list">
            {list.map((a) => (
              <div key={a.id} className="viz-item clickable" onClick={() => openApp(a)}>
                <span className="viz-co">{a.companyName}</span>
                <span className="viz-title">{a.jobTitle}</span>
                {a.subState && (
                  <span className={`badge ${TONE_CLASS[a.subTone || "gray"] || "b-gray"}`}>{a.subState}</span>
                )}
                <span className="viz-date">{shortDay(a.createdAt)}</span>
                <span className="viz-link">↗</span>
              </div>
            ))}
            {list.length === 0 && <div className="hint">该分组暂无投递</div>}
          </div>
        </div>
      </div>
      )}

      {tip && (
        <div className="viz-tip" style={{ left: Math.min(tip.x + 14, (typeof window !== "undefined" ? window.innerWidth : 1000) - 180), top: tip.y - 10 }}>
          {tip.text}
        </div>
      )}
    </div>
  );
}
