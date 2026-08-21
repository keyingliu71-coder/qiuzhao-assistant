"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { STAGE_NAMES, SUB_STATE_OPTIONS } from "@/lib/constants";
import { matchJob, scoreCls } from "@/lib/match";
import AddJobModal from "../components/AddJobModal";
import {
  updateStage,
  addTodo,
  toggleTodo,
  editTodo,
  delTodo,
  setPriority,
  setSatisfaction,
  setSubState,
  aiEvaluateMatch,
  delApplication,} from "@/app/(app)/actions";

type Todo = { id: string; text: string; done: boolean };
type Ev = {
  id: string;
  type: string;
  fromStage?: number | null;
  toStage?: number | null;
  note?: string | null;
  createdAt: string;
};
type App = {
  id: string;
  jobTitle: string;
  companyId?: string | null;
  companyName: string;
  location: string;
  stage: number;
  stageName: string;
  subState?: string | null;
  subTone?: string | null;
  priority: string;
  satisfaction?: string | null;
  nextTodo?: string | null;
  riskNote?: string | null;
  createdAt: string;
  todos: Todo[];
  events: Ev[];
};
type EvRow = {
  id: string;
  fact: string;
  experience?: string | null;
  sourceFile?: string | null;
  confirmed: boolean;
  writable: boolean;
  defenseLevel?: string | null;
  metricOk?: boolean | null;
  contributionOk?: boolean | null;
  risk?: string | null;
};

const TONE_CLASS: Record<string, string> = {
  terra: "b-terra",
  sand: "b-sand",
  dusty: "b-dusty",
  sage: "b-sage",
  rose: "b-rose",
  gray: "b-gray",
};

function prioBadge(p: string) {
  if (p === "高") return <span className="badge b-rose">优先级高</span>;
  if (p === "低") return <span className="badge b-gray">优先级低</span>;
  return null;
}
function subBadge(app: App) {
  if (!app.subState) return null;
  const cls = TONE_CLASS[app.subTone || "gray"] || "b-gray";
  return <span className={`badge ${cls}`}>{app.subState}</span>;
}

export default function BoardClient({
  apps: initial,
  evidence,
}: {
  apps: App[];
  evidence: EvRow[];
}) {
  const [apps, setApps] = useState<App[]>(initial);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [openId, setOpenId] = useState<string | null>(null);
  const [tab, setTab] = useState("overview");
  const [drag, setDrag] = useState<{ id: string; from: number } | null>(null);
  const [toast, setToast] = useState("");
  const [, start] = useTransition();

  const cur = apps.find((a) => a.id === openId) || null;

  // 搜索：按 公司名 + 岗位名 过滤
  const kw = query.trim().toLowerCase();
  const shown = kw
    ? apps.filter((a) => (a.companyName + " " + a.jobTitle).toLowerCase().includes(kw))
    : apps;

  function showToast(m: string) {
    setToast(m);
    setTimeout(() => setToast(""), 2400);
  }
  function updateApp(id: string, fn: (a: App) => App) {
    setApps((arr) => arr.map((a) => (a.id === id ? fn(a) : a)));
  }

  async function onDrop(to: number) {
    if (!drag) return;
    const { id, from } = drag;
    setDrag(null);
    if (to === from) return;
    if (to < from && !confirm(`确定把卡片从「${STAGE_NAMES[from]}」回退到「${STAGE_NAMES[to]}」吗？\n（进度历史会保留）`)) {
      return;
    }
    start(async () => {
      await updateStage(id, to);
      updateApp(id, (a) => ({
        ...a,
        stage: to,
        stageName: STAGE_NAMES[to],
      }));
    });
    showToast(`✅ 已更新进度 → ${STAGE_NAMES[to]}`);
  }

  // ---- 待办操作 ----
  async function doAdd(appId: string, text: string) {
    const r = await addTodo(appId, text);
    if (r) updateApp(appId, (a) => ({ ...a, todos: [...a.todos, { id: r.id, text: r.text, done: false }] }));
  }
  async function doToggle(appId: string, t: Todo) {
    await toggleTodo(t.id);
    updateApp(appId, (a) => ({ ...a, todos: a.todos.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)) }));
  }
  async function doEdit(appId: string, t: Todo, text: string) {
    await editTodo(t.id, text);
    updateApp(appId, (a) => ({ ...a, todos: a.todos.map((x) => (x.id === t.id ? { ...x, text } : x)) }));
  }
  async function doDel(appId: string, t: Todo) {
    await delTodo(t.id);
    updateApp(appId, (a) => ({ ...a, todos: a.todos.filter((x) => x.id !== t.id) }));
    showToast("已删除待办");
  }
  async function doPriority(v: string) {
    if (!cur) return;
    await setPriority(cur.id, v);
    updateApp(cur.id, (a) => ({ ...a, priority: v }));
  }
  async function doSat(v: string) {
    if (!cur) return;
    await setSatisfaction(cur.id, v);
    updateApp(cur.id, (a) => ({ ...a, satisfaction: v }));
  }
  async function doSub(v: string) {
    if (!cur) return;
    const tone = v.includes("拒") || v.includes("结束") ? "gray" : v.includes("Offer") ? "sage" : "dusty";
    await setSubState(cur.id, v, tone);
    updateApp(cur.id, (a) => ({ ...a, subState: v, subTone: tone }));
    showToast("已更新子状态");
  }
  async function doDelApp(id: string) {
    if (!confirm("确定删除这张投递卡片吗？关联的待办与进度历史会一并删除，且不可恢复。")) return;
    const r = await delApplication(id);
    if (r.ok) {
      setOpenId(null);
      setApps((arr) => arr.filter((a) => a.id !== id));
      showToast("已删除投递卡片");
    }
  }

  return (
    <div className="page">
      <div className="toolbar">
        <h1 className="pagetitle" style={{ margin: 0 }}>
          投递看板
        </h1>
        <span style={{ flex: 1 }}></span>
        <AddJobModal
          onAdded={(company, jobTitle) => {
            const nb: App = {
              id: `add-${Date.now()}`,
              jobTitle,
              companyId: null,
              companyName: company,
              location: "",
              stage: 0,
              stageName: STAGE_NAMES[0],
              subState: "待评估",
              subTone: "gray",
              priority: "中",
              nextTodo: "用「简历制作 Skill」生成定向简历",
              createdAt: new Date().toISOString(),
              todos: [],
              events: [],
            };
            setApps((arr) => [nb, ...arr]);
            showToast(`已添加：${company} · ${jobTitle}`);
          }}
        />
        <div className="view-switch">
          <button className={view === "kanban" ? "active" : ""} onClick={() => setView("kanban")}>
            看板
          </button>
          <button className={view === "list" ? "active" : ""} onClick={() => setView("list")}>
            列表
          </button>
        </div>
      </div>
      <div className="pagedesc">
        拖动卡片更新进度（前推生效、回退确认）；点卡片打开岗位工作台，可改待办 / 子状态 / 新建待办。
      </div>

      {/* 看板搜索 */}
      <div className="ctable-tools" style={{ marginBottom: 12 }}>
        <input
          className="search-input"
          placeholder="🔍 搜索公司 / 岗位（如：小米、AI产品经理）"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="c-count">匹配 {shown.length} 条投递</span>
      </div>

      <div className="legend">
        <span>
          <span className="dot d-terra"></span>优先级高
        </span>
        <span>
          <span className="dot d-dusty"></span>满意度高
        </span>
        <span>
          <span className="dot d-sage"></span>进行中
        </span>
        <span>
          <span className="dot d-rose"></span>有风险
        </span>
        <span className="hint">🖱 可拖拽 · 点卡片可编辑</span>
      </div>

      {view === "kanban" ? (
        <div className="kanban">
          {STAGE_NAMES.map((name, stage) => {
            const col = shown.filter((a) => a.stage === stage);
            return (
              <div
                key={stage}
                className="col"
                data-stage={stage}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(stage)}
              >
                <h3>
                  {name} <span className="cnt">{col.length}</span>
                </h3>
                {col.map((a) => (
                  <div
                    key={a.id}
                    className="card"
                    draggable
                    onDragStart={() => setDrag({ id: a.id, from: stage })}
                    onClick={() => {
                      setOpenId(a.id);
                      setTab("overview");
                    }}
                  >
                    <div className="c-co">{a.companyName}</div>
<div className="c-title">{a.jobTitle}<button className="card-del" title="删除此卡片" onClick={(e)=>{e.stopPropagation(); doDelApp(a.id);}}>🗑</button></div>
                    <div className="c-sub">
                      {a.location || "—"}
                      {a.stage > 0 ? " · 已投递" : ""}
                    </div>
                    <div className="c-row">
                      {subBadge(a)}
                      {prioBadge(a.priority)}
                      {a.satisfaction === "高" && <span className="badge b-dusty">满意度高</span>}
                    </div>
                    {a.nextTodo && <div className="c-todo">下一待办：{a.nextTodo}</div>}
                    {a.riskNote && <div className="c-risk">⚠ {a.riskNote}</div>}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="ctable-wrap">
          <table>
            <thead>
              <tr>
                <th>公司</th>
                <th>岗位</th>
                <th>地点</th>
                <th>阶段</th>
                <th>子状态</th>
                <th>优先级</th>
                <th>满意度</th>
                <th>下一待办</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((a) => (
                <tr
                  key={a.id}
                  className="clickable"
                  onClick={() => {
                    setOpenId(a.id);
                    setTab("overview");
                  }}
                >
                  <td className="td-co">{a.companyName}</td>
                  <td>{a.jobTitle}</td>
                  <td>{a.location || "—"}</td>
                  <td>{a.stageName}</td>
                  <td>{subBadge(a)}</td>
                  <td>{prioBadge(a.priority) || "—"}</td>
                  <td>{a.satisfaction ? <span className="badge b-dusty">{a.satisfaction}</span> : "—"}</td>
                  <td>{a.nextTodo || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 工作台抽屉 */}
      <div
        className={"drawer-mask" + (openId ? " open" : "")}
        onClick={() => setOpenId(null)}
      />
      <div className={"drawer" + (openId ? " open" : "")}>
        {cur && (
          <>
            <div className="drawer-head">
              <div className="row" style={{ width: "100%" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{cur.jobTitle}</div>
                  <div className="hint">一个岗位的全部资料聚合在此 · 八区块 + AI 工作台</div>
                </div>
                <button className="close-btn" onClick={() => setOpenId(null)}>
                  ✕
                </button>
              </div>
            </div>
            <div className="bench-ai">
              <span className="ai-lbl">🤖 AI 工作台</span>
              <Link href="/ai" className="btn primary sm">
                📝 简历制作 Skill
              </Link>
              <Link href="/ai" className="btn primary sm">
                🎤 面试 Skill
              </Link>
            </div>
            <div className="bench-tabs">
              {[
                ["overview", "岗位概览"],
                ["jd", "JD与匹配"],
                ["cv", "定向简历"],
                ["track", "投递记录"],
                ["prep", "面试准备"],
                ["mock", "模拟面试"],
                ["review", "面试复盘"],
                ["risk", "证据风险"],
              ].map(([k, label]) => (
                <button
                  key={k}
                  className={"btab" + (tab === k ? " active" : "")}
                  onClick={() => setTab(k)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="drawer-body">
              {tab === "overview" && <OverviewTab app={cur} onAdd={doAdd} onToggle={doToggle} onEdit={doEdit} onDel={doDel} onPriority={doPriority} onSat={doSat} onSub={doSub} />}
              {tab === "jd" && <JdTab app={cur} />}
              {tab === "cv" && <CvTab app={cur} />}
              {tab === "track" && <TrackTab app={cur} />}
              {tab === "prep" && <PrepTab app={cur} evidence={evidence} />}
              {tab === "mock" && <MockTab app={cur} />}
              {tab === "review" && <ReviewTab app={cur} evidence={evidence} />}
              {tab === "risk" && <RiskTab app={cur} evidence={evidence} />}
            </div>
          </>
        )}
      </div>

      {toast && (
        <div id="toast" className="show" style={{ position: "fixed", left: "50%", bottom: 34, transform: "translateX(-50%)", background: "var(--ink)", color: "#fff", padding: "9px 18px", borderRadius: 10, fontSize: 13, zIndex: 300 }}>
          {toast}
        </div>
      )}
    </div>
  );
}

/* ===== 各 Tab ===== */
function OverviewTab({
  app,
  onAdd,
  onToggle,
  onEdit,
  onDel,
  onPriority,
  onSat,
  onSub,
}: {
  app: App;
  onAdd: (id: string, t: string) => void;
  onToggle: (id: string, t: Todo) => void;
  onEdit: (id: string, t: Todo, v: string) => void;
  onDel: (id: string, t: Todo) => void;
  onPriority: (v: string) => void;
  onSat: (v: string) => void;
  onSub: (v: string) => void;
}) {
  const [newT, setNewT] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editV, setEditV] = useState("");
  const subOpts = SUB_STATE_OPTIONS[app.stage] || [];

  return (
    <>
      <h3 style={{ fontSize: 14, marginBottom: 10 }}>岗位概览</h3>
      <div className="version-chain" style={{ marginBottom: 14 }}>
        <span className="vnode cur">当前：{app.stageName}</span>
        <span className="vnode">
          子状态
          <select
            className="mini-sel"
            value={app.subState || ""}
            onChange={(e) => e.target.value && onSub(e.target.value)}
          >
            <option value="">(未细分)</option>
            {subOpts.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </span>
        <span className="vnode">
          满意度
          <select className="mini-sel" value={app.satisfaction || ""} onChange={(e) => onSat(e.target.value)}>
            <option value="">未评</option>
            <option>高</option>
            <option>中</option>
            <option>低</option>
          </select>
        </span>
        <span className="vnode">
          优先级
          <select className="mini-sel" value={app.priority} onChange={(e) => onPriority(e.target.value)}>
            <option>高</option>
            <option>中</option>
            <option>低</option>
          </select>
        </span>
      </div>
      <div className="lbl" style={{ marginBottom: 6 }}>
        📌 待办（双击可改 · ✕删除 · 底部可新建）
      </div>
      {app.todos.map((t) =>
        editId === t.id ? (
          <div className="todo-edit-item" key={t.id}>
            <input
              className="te-input"
              autoFocus
              value={editV}
              onChange={(e) => setEditV(e.target.value)}
              onBlur={() => {
                if (editV.trim()) onEdit(app.id, t, editV.trim());
                setEditId(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (editV.trim()) onEdit(app.id, t, editV.trim());
                  setEditId(null);
                }
              }}
            />
          </div>
        ) : (
          <div className="todo-edit-item" key={t.id}>
            <input type="checkbox" checked={t.done} onChange={() => onToggle(app.id, t)} />
            <span
              className={"te-text" + (t.done ? " done" : "")}
              onDoubleClick={() => {
                setEditId(t.id);
                setEditV(t.text);
              }}
            >
              {t.text}
            </span>
            <span className="te-btn" title="编辑" onClick={() => { setEditId(t.id); setEditV(t.text); }}>
              ✎
            </span>
            <span className="te-btn" title="删除" onClick={() => onDel(app.id, t)}>
              ✕
            </span>
          </div>
        )
      )}
      {app.todos.length === 0 && <div className="hint">暂无待办，新建一个吧。</div>}
      <div className="todo-add">
        <input
          placeholder="新建待办，如：周三前完成在线测评…"
          value={newT}
          onChange={(e) => setNewT(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && newT.trim()) {
              onAdd(app.id, newT.trim());
              setNewT("");
            }
          }}
        />
        <span
          className="btn primary sm"
          onClick={() => {
            if (newT.trim()) {
              onAdd(app.id, newT.trim());
              setNewT("");
            }
          }}
        >
          + 新建待办
        </span>
      </div>
      <div className="gap-item" style={{ marginTop: 14 }}>
        <span>⏰ 关键时间</span>
        <div>加入：{new Date(app.createdAt).toLocaleDateString("zh-CN")}</div>
      </div>
    </>
  );
}

function JdTab({ app }: { app: App }) {
  const m = matchJob(app.jobTitle); // 占位：即时显示预估
  const [loading, setLoading] = useState(false);
  const [r, setR] = useState<{ score: number; evidence: string[]; gaps: string[] } | null>(null);
  const [err, setErr] = useState("");

  async function run() {
    setLoading(true);
    setErr("");
    const res = await aiEvaluateMatch(app.id);
    setLoading(false);
    if (!res.ok) {
      setErr(res.msg);
      return;
    }
    setR({ score: res.score, evidence: res.evidence, gaps: res.gaps });
  }

  const score = r ? r.score : m.score;
  const evs = r ? r.evidence : m.hits.map((h) => h.tag);
  const gaps = r ? r.gaps : m.gaps;
  const scoreColor = score >= 85 ? "var(--sage)" : score >= 65 ? "var(--sand)" : "var(--muted)";

  return (
    <>
      <h3 style={{ fontSize: 14, marginBottom: 10 }}>JD 与匹配分析</h3>
      <div className="jd-kv">
        <div>
          匹配度
          <b style={{ color: scoreColor }}>
            {score}
            {r ? " (AI)" : ""}
          </b>
        </div>
        <div>命中证据<b>{evs.length}</b></div>
        <div>缺口<b>{gaps.length}</b></div>
      </div>
      <span
        className="btn primary sm"
        style={{ cursor: "pointer", opacity: loading ? 0.6 : 1, marginBottom: 8, display: "inline-block" }}
        onClick={run}
      >
        {loading ? "评估中…" : "🤖 AI 评估"}
      </span>
      {evs.map((e, i) => (
        <div className="gap-item" key={i}>
          <span>🟢 命中</span>
          <div>{e}</div>
        </div>
      ))}
      {gaps.map((g, i) => (
        <div className="gap-item" key={i}>
          <span>🟡 缺口</span>
          <div>{g}</div>
        </div>
      ))}
      {err && (
        <div style={{ color: "var(--rose)", marginTop: 8 }}>{err}</div>
      )}
      <div className="hint" style={{ marginTop: 8 }}>
        {r
          ? "已基于真实模型评估；结论仅供参考，落库需你确认。"
          : "上方为占位预估，点「AI 评估」获取真实匹配度与证据/缺口。"}
      </div>
    </>
  );
}

function CvTab({ app }: { app: App }) {
  return (
    <>
      <span className="sk-tag">📝 由「简历制作 Skill」驱动</span>
      <h3 style={{ fontSize: 14, marginBottom: 10 }}>定向简历版本链</h3>
      <div className="version-chain">
        <span className="vnode">母版 v3</span>
        <span className="varrow">→</span>
        <span className="vnode cur">本岗 v2</span>
      </div>
      <div className="gap-item" style={{ marginTop: 12 }}>
        <span>✨ 一键生成</span>
        <div>
          简历 Skill 按本岗 JD 突出相关项目、弱化无关实习，产出可投递版本。
          <Link href="/ai" className="btn primary sm" style={{ marginLeft: 8 }}>
            去 AI 工作台生成
          </Link>
        </div>
      </div>
      <div className="hint" style={{ marginTop: 8 }}>
        Skill 未接入，按钮为示意；接入后产出真实 DOCX/MD。
      </div>
    </>
  );
}

function TrackTab({ app }: { app: App }) {
  return (
    <>
      <h3 style={{ fontSize: 14, marginBottom: 10 }}>投递记录 · 时间线</h3>
      {app.events.length === 0 && <div className="hint">暂无流程事件。</div>}
      <div className="timeline">
        {app.events.map((e) => (
          <div className="t-item" key={e.id}>
            <div className="t-time">{new Date(e.createdAt).toLocaleString("zh-CN")}</div>
            <div className="t-text">{e.type}{e.toStage != null ? ` → ${STAGE_NAMES[e.toStage]}` : ""}</div>
            {e.note && <div className="t-desc">{e.note}</div>}
          </div>
        ))}
      </div>
    </>
  );
}

function PrepTab({ app, evidence }: { app: App; evidence: EvRow[] }) {
  const ev = evidence.filter((e) => e.confirmed).slice(0, 2);
  return (
    <>
      <span className="sk-tag blue">🎤 由「面试 Skill」驱动</span>
      <h3 style={{ fontSize: 14, marginBottom: 10 }}>面试准备</h3>
      <div className="qa-item">
        <div className="q">你为什么适合「{app.jobTitle}」？</div>
        <div className="a">结合证据库相关项目说明从 0 到 1 的落地经验。</div>
        {ev[0] && <div className="ev">引用证据：{ev[0].fact}</div>}
      </div>
      <div className="qa-item">
        <div className="q">讲一个数据驱动决策的例子</div>
        <div className="a">用实习/项目里的指标提升说明方法：假设→实验→归因。</div>
        {ev[1] && <div className="ev">引用证据：{ev[1].fact}</div>}
      </div>
      <div className="hint" style={{ marginTop: 8 }}>Skill 接入后此处为真实问答与模拟评分。</div>
    </>
  );
}

function MockTab({ app }: { app: App }) {
  return (
    <>
      <span className="sk-tag blue">🎤 由「面试 Skill」驱动</span>
      <h3 style={{ fontSize: 14, marginBottom: 10 }}>模拟面试</h3>
      <div className="gap-item">
        <span>🎙 最近一次</span>
        <div>
          模拟一面 · 综合评分待生成
          <Link href="/ai" className="btn primary sm" style={{ marginLeft: 8 }}>
            去 AI 工作台模拟
          </Link>
        </div>
      </div>
      <div className="hint">Skill 接入后此处为可交互的真实模拟。</div>
    </>
  );
}

function ReviewTab({ app, evidence }: { app: App; evidence: EvRow[] }) {
  const risk = evidence.find((e) => e.defenseLevel === "面试高风险");
  return (
    <>
      <span className="sk-tag blue">🎤 由「面试 Skill」驱动</span>
      <h3 style={{ fontSize: 14, marginBottom: 10 }}>面试复盘</h3>
      <div className="qa-item">
        <div className="q">追问：关键指标怎么来的？</div>
        <div className="a">统一为「问卷满意度 N=312，均分 4.86/5」等可辩护口径。</div>
      </div>
      <div className="gap-item">
        <span>✅ 行动项</span>
        <div>
          更新证据库：相关项目 defense_level → 高；补充指标定义（已生成建议更新，待确认）。
          {risk && <span className="hint"> · 涉及：{risk.fact}</span>}
        </div>
      </div>
    </>
  );
}

function RiskTab({ app, evidence }: { app: App; evidence: EvRow[] }) {
  const risk = evidence.filter((e) => e.risk);
  return (
    <>
      <h3 style={{ fontSize: 14, marginBottom: 10 }}>证据风险变化</h3>
      {risk.length === 0 && <div className="hint">暂无风险提示。</div>}
      <div className="timeline">
        {risk.map((e) => (
          <div className="t-item" key={e.id}>
            <div className="t-text" style={{ color: "var(--rose)" }}>
              {e.fact} — {e.defenseLevel || "风险"}
            </div>
            <div className="t-desc">{e.risk}</div>
          </div>
        ))}
      </div>
    </>
  );
}