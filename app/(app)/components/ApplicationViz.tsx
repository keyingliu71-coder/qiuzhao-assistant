"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

// 投递进度可视化（可交互版）：环形图 / 柱状图 / 明细列表
// 柱状图顶部带周时间轴：默认展开最近一周（每日柱），可切换到任意一周或"全部"（每周柱），
// 既满足筛选需求，也避免日柱过多导致横向溢出。
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

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function localDay(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function shortDay(iso: string) {
  return localDay(iso).slice(5).replace("-", ".");
}
// 所在周的周一（YYYY-MM-DD）
function mondayOf(d: Date): string {
  const day = d.getDay(); // 0=周日
  const diff = day === 0 ? -6 : 1 - day;
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
  return `${m.getFullYear()}-${pad2(m.getMonth() + 1)}-${pad2(m.getDate())}`;
}
function weekLabel(start: string) {
  const d = new Date(start + "T00:00:00");
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 6);
  return `${pad2(d.getMonth() + 1)}.${pad2(d.getDate())}-${pad2(end.getMonth() + 1)}.${pad2(end.getDate())}`;
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
  const [weekSel, setWeekSel] = useState<string>("latest"); // "latest" | "all" | 周一日期
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  // 柱状图浮窗：hover 临时展示，点击固定
  const [pop, setPop] = useState<{ key: string; x: number; y: number } | null>(null);
  const [pinKey, setPinKey] = useState<string | null>(null);

  const stats = useMemo(() => {
    const delivered = apps.filter((a) => a.stage >= 1);
    const companies = new Set(delivered.map((a) => a.companyName)).size;
    const waiting = delivered.filter((a) => a.stage === 1);
    const progress = delivered.filter((a) => a.stage === 2 || a.stage === 3);
    const ended = delivered.filter((a) => a.stage === 4);

    // 按周聚合（周一到周日）
    const weekMap = new Map<string, { start: string; count: number; days: Map<string, number> }>();
    for (const a of delivered) {
      const d = localDay(a.createdAt);
      const wk = mondayOf(new Date(a.createdAt));
      let w = weekMap.get(wk);
      if (!w) {
        w = { start: wk, count: 0, days: new Map() };
        weekMap.set(wk, w);
      }
      w.count += 1;
      w.days.set(d, (w.days.get(d) || 0) + 1);
    }
    const weeks = [...weekMap.values()]
      .map((w) => ({
        start: w.start,
        count: w.count,
        days: [...w.days.entries()].sort((x, y) => (x[0] < y[0] ? -1 : 1)),
      }))
      .sort((x, y) => (x.start < y.start ? -1 : 1));
    return { delivered, companies, waiting, progress, ended, weeks };
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

  // 当前选中周：默认最近一周；"全部"则按周柱展示
  const latestStart = stats.weeks.length ? stats.weeks[stats.weeks.length - 1].start : null;
  const activeWeek = weekSel === "all" ? null : weekSel === "latest" ? latestStart : weekSel;
  const activeWeekData = stats.weeks.find((w) => w.start === activeWeek) || null;

  const list = useMemo(() => {
    let base = [...apps];
    if (activeWeek) base = base.filter((a) => mondayOf(new Date(a.createdAt)) === activeWeek);
    if (filter === "all") return base.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    if (filter === "waiting" || filter === "progress" || filter === "ended") {
      return base.filter((a) => a.stage >= 1 && (filter === "waiting" ? a.stage === 1 : filter === "progress" ? a.stage === 2 || a.stage === 3 : a.stage === 4)).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    }
    if (filter.startsWith("day:")) {
      const d = filter.slice(4);
      return base.filter((a) => localDay(a.createdAt) === d);
    }
    return [];
  }, [apps, filter, stats, activeWeek]);

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

  // 某根柱子对应的岗位明细：每日柱 → 当天；每周柱 → 该周
  function barApps(key: string): VizApp[] {
    if (activeWeekData) return apps.filter((a) => a.stage >= 1 && localDay(a.createdAt) === key);
    return apps.filter((a) => a.stage >= 1 && mondayOf(new Date(a.createdAt)) === key);
  }
  function popTitle(key: string): string {
    return activeWeekData ? `${weekLabel(activeWeekData.start)} ${shortDay(key)}` : weekLabel(key);
  }
  // 渲染岗位明细列表（浮窗与固定面板共用）
  function jobListJSX(apps: VizApp[]) {
    if (!apps.length) return <div className="hint">该分组暂无投递</div>;
    return (
      <>
        {apps.map((a) => (
          <div key={a.id} className="viz-pop-item" onClick={() => openApp(a)} title="点击打开官方应聘记录">
            <span className="viz-co">{a.companyName}</span>
            <span className="viz-title">{a.jobTitle}</span>
            <span className="viz-date">{shortDay(a.createdAt)}</span>
          </div>
        ))}
      </>
    );
  }

  const listTitle =
    filter === "all"
      ? activeWeek
        ? `最近「${weekLabel(activeWeek)}」投递（${list.length}）`
        : `全部投递（${apps.length}）`
      : filter === "waiting" || filter === "progress" || filter === "ended"
        ? `${SEG_META[filter].label}（${list.length}）`
        : `「${shortDay(filter.slice(4))}」投递（${list.length}）`;

  // 柱状图数据：选中周 → 每日柱；否则 → 每周柱
  const chartBars: { key: string; label: string; n: number; tip: string }[] = activeWeekData
    ? activeWeekData.days.map(([d, n]) => ({ key: d, label: shortDay(d), n, tip: `${weekLabel(activeWeekData.start)} ${shortDay(d)} 投递 ${n} 岗` }))
    : stats.weeks.map((w) => ({ key: w.start, label: weekLabel(w.start), n: w.count, tip: `${weekLabel(w.start)} 投递 ${w.count} 岗` }));
  const chartMax = Math.max(...chartBars.map((b) => b.n), 1);
  const chartTitle = activeWeekData
    ? `${weekLabel(activeWeekData.start)} · 每日投递量（${activeWeekData.count} 岗）· 点柱子筛当天`
    : `每周投递量（累计 ${total} 岗）· 点柱子看该周每日`; 

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
          <h4>{chartTitle}</h4>
          <div className="viz-weekbar">
            <span
              className={"chip" + (weekSel === "all" ? " on" : "")}
              onClick={() => {
                setWeekSel("all");
                setFilter("all");
              }}
            >
              全部
            </span>
            {stats.weeks.map((w) => (
              <span
                key={w.start}
                className={"chip" + ((weekSel === w.start || (weekSel === "latest" && w.start === latestStart)) ? " on" : "")}
                onClick={() => {
                  setWeekSel(w.start);
                  setFilter("all");
                }}
              >
                {weekLabel(w.start)} <b>{w.count}</b>
              </span>
            ))}
            {stats.weeks.length === 0 && <span className="hint">暂无投递数据</span>}
          </div>
          <div className="barchart">
            {chartBars.map((b) => (
              <div
                key={b.key}
                className={"bar-col" + (filter === `day:${b.key}` ? " on" : "")}
                onMouseEnter={(e) => setPop({ key: b.key, x: e.clientX, y: e.clientY })}
                onMouseMove={(e) => setPop((p) => (p && p.key === b.key ? { ...p, x: e.clientX, y: e.clientY } : p))}
                onMouseLeave={() => setPop((p) => (p && !(pinKey === p.key) ? null : p))}
                onClick={() => {
                  if (activeWeekData) {
                    setFilter(filter === `day:${b.key}` ? "all" : `day:${b.key}`);
                    setPinKey((k) => (k === b.key ? null : b.key));
                  } else {
                    // 周柱：进入该周查看每日
                    setWeekSel(b.key);
                    setFilter("all");
                    setPinKey(null);
                  }
                }}
              >
                <div className="bar" style={{ height: `${Math.max((b.n / chartMax) * 100, 8)}%` }}>
                  {b.n}
                </div>
                <div className="bar-label">{b.label}</div>
              </div>
            ))}
            {chartBars.length === 0 && <div className="hint">暂无投递数据</div>}
          </div>
          {pinKey && (
            <div className="viz-pin">
              <div className="viz-pin-head">
                📌 {popTitle(pinKey)} · {barApps(pinKey).length} 岗
                <span className="viz-pin-close" onClick={() => setPinKey(null)}>
                  ✕ 关闭
                </span>
              </div>
              <div className="viz-pin-list">{jobListJSX(barApps(pinKey))}</div>
            </div>
          )}
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

      {pop && !(pinKey === pop.key) && (
        <div
          className="viz-pop"
          style={{
            left: Math.min(pop.x + 14, (typeof window !== "undefined" ? window.innerWidth : 1200) - 310),
            top: Math.min(pop.y + 12, (typeof window !== "undefined" ? window.innerHeight : 800) - 260),
          }}
        >
          <div className="viz-pop-head">
            {popTitle(pop.key)} · {barApps(pop.key).length} 岗（点击柱子固定）
          </div>
          <div className="viz-pop-list">{jobListJSX(barApps(pop.key))}</div>
        </div>
      )}
    </div>
  );
}
