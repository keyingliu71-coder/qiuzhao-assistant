"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { matchJob, scoreCls, parseJobs } from "@/lib/match";
import { toggleFavorite, prunePersonalCompanies } from "@/app/(app)/actions";
import AddToBoardButton from "../components/AddToBoardButton";

type CompanyLite = {
  id: string;
  name: string;
  nature?: string | null;
  industry?: string | null;
  batch?: string | null;
  target?: string | null;
  location?: string | null;
  positions?: string | null;
  updateDate?: string | null;
  deadline?: string | null;
  applyLink?: string | null;
  hasWrittenTest?: string | null;
  favorited?: boolean;
};

const PAGE = 20;

export default function CompaniesClient({
  companies: all,
  batches,
  natures,
  totalAll,
  openCompany,
}: {
  companies: CompanyLite[];
  batches: string[];
  natures: string[];
  totalAll: number;
  openCompany: CompanyLite | null;
}) {
  const [modalOpen, setModalOpen] = useState<boolean>(!!openCompany);
  const [cur, setCur] = useState<CompanyLite | null>(openCompany);
  const [selJob, setSelJob] = useState(0);

  // 客户端搜索 / 筛选 / 分页状态
  const [q, setQ] = useState("");
  const [nature, setNature] = useState("");
  const [batch, setBatch] = useState("");
  const [page, setPage] = useState(1);

  // 搜索 + 筛选（内存过滤，即时响应，无整页刷新）
  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    let list = all;
    if (kw)
      list = list.filter(
        (c) =>
          (c.name || "").toLowerCase().includes(kw) ||
          (c.industry || "").toLowerCase().includes(kw) ||
          (c.location || "").toLowerCase().includes(kw) ||
          (c.batch || "").toLowerCase().includes(kw)
      );
    if (nature) list = list.filter((c) => c.nature === nature);
    if (batch) list = list.filter((c) => c.batch === batch);
    return list;
  }, [all, q, nature, batch]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const safePage = Math.min(page, pages);
  const companies = filtered.slice((safePage - 1) * PAGE, safePage * PAGE);
  const total = filtered.length;

  // 收藏状态
  const [fav, setFav] = useState<Record<string, boolean>>(() => {
    const m: Record<string, boolean> = {};
    all.forEach((c) => { if (c.favorited) m[c.id] = true; });
    if (openCompany?.favorited) m[openCompany.id] = true;
    return m;
  });
  const [favPend, setFavPend] = useState<string | null>(null);
  async function toggleFav(id: string) {
    if (favPend) return;
    setFavPend(id);
    try {
      const r = await toggleFavorite(id);
      if (r?.ok) setFav((prev) => ({ ...prev, [id]: !!r.fav }));
    } finally {
      setFavPend(null);
    }
  }

  function openModal(c: CompanyLite) {
    setCur(c);
    setSelJob(0);
    setModalOpen(true);
  }

  const jobs = cur ? parseJobs(cur.positions || "") : [];

  function JobDetail() {
    if (!cur) return null;
    if (jobs.length === 0) {
      return (
        <div className="jd-sec">
          <h3>岗位详情</h3>
          <div className="jd-kv">
            <div>公司<b>{cur.name}</b></div>
            <div>批次<b>{cur.batch || "—"}</b></div>
            <div>对象<b>{cur.target || "—"}</b></div>
            <div>地点<b>{cur.location || "—"}</b></div>
            <div>更新<b>{cur.updateDate || "—"}</b></div>
            <div>截止<b>{cur.deadline || "—"}</b></div>
          </div>
          <p className="jd-note">
            该公司来源未列出具体岗位，点下方入口到官网查看完整 JD：
          </p>
          <a
            className="btn primary"
            href={cur.applyLink || "#"}
            target="_blank"
            rel="noopener"
          >
            前往官网投递 ↗
          </a>
        </div>
      );
    }
    const name = jobs[selJob] || cur.name;
    const m = matchJob(`${name} ${cur.industry || ""}`);
    return (
      <div className="jd-sec">
        <h3>{name}</h3>
        <div className="jd-kv">
          <div>公司<b>{cur.name}</b></div>
          <div>批次<b>{cur.batch || "—"}</b></div>
          <div>面向对象<b>{cur.target || "—"}</b></div>
          <div>工作地点<b>{cur.location || "—"}</b></div>
          <div>更新<b>{cur.updateDate || "—"}</b></div>
          <div>截止<b>{cur.deadline || "—"}</b></div>
        </div>
        <p className="jd-note">
          完整 JD 正文（职责 / 要求）以官网为准，点底部入口查看；此处先给出匹配分析，帮你决定要不要投。
        </p>
        <h3>
          🎯 匹配分析{" "}
          <span className="hint" style={{ fontWeight: 400 }}>
            （原型：岗位关键词 × 证据库实时计算）
          </span>
        </h3>
        <div className="row" style={{ gap: 14, alignItems: "center", margin: "6px 0 12px" }}>
          <span
            className={`matchscore ${scoreCls(m.score)}`}
            style={{ fontSize: 22, minWidth: 64, padding: "8px 10px" }}
          >
            {m.score}
          </span>
          <div style={{ flex: 1 }}>
            <div className="matchbar">
              <i
                style={{
                  width: `${m.score}%`,
                  background:
                    m.score >= 85
                      ? "var(--sage)"
                      : m.score >= 65
                      ? "var(--sand)"
                      : "var(--muted)",
                }}
              ></i>
            </div>
            <div className="jd-note">
              匹配度 {m.score} / 100 · 命中 {m.hits.length} 个方向 · 缺口{" "}
              {m.gaps.length} 项
            </div>
          </div>
        </div>
        <div className="lbl" style={{ marginBottom: 6 }}>
          命中证据
        </div>
        {m.hits.length ? (
          m.hits.map((h, i) => (
            <div className="gap-item" key={i}>
              <span>🟢 {h.tag}</span>
              <div>{h.ev}</div>
            </div>
          ))
        ) : (
          <div className="gap-item">
            <span>⚪ 暂无命中</span>
            <div>该岗位方向与证据库现有经历重合度低</div>
          </div>
        )}
        <div className="lbl" style={{ margin: "10px 0 6px" }}>
          缺口清单
        </div>
        {m.gaps.length ? (
          m.gaps.map((g, i) => (
            <div className="gap-item" key={i}>
              <span>🟡 缺口</span>
              <div>{g}</div>
            </div>
          ))
        ) : (
          <div className="gap-item">
            <span>🟢 无明显缺口</span>
            <div>核心方向已覆盖</div>
          </div>
        )}
        <div className="row" style={{ marginTop: 14, gap: 8 }}>
          <AddToBoardButton companyId={cur.id} jobTitle={name} label="加入待投递" />
          <Link href="/ai" className="btn sm">
            用 AI 工作台评估 →
          </Link>
          <a
            className="btn sm mocklink"
            href={cur.applyLink || "#"}
            target="_blank"
            rel="noopener"
          >
            前往官网投递 ↗
          </a>
        </div>
      </div>
    );
  }

  function goto(p: number) {
    setPage(Math.max(1, Math.min(p, pages)));
  }

  return (
    <div className="page">
      <div className="toolbar">
        <h1 className="pagetitle" style={{ margin: 0 }}>
          公司招聘库
        </h1>
        <span style={{ flex: 1 }}></span>
        <span className="realdata-tag">● offerio 实时同步</span>
      </div>
      <div className="pagedesc">
        点任意公司「查看岗位」弹出小窗：左侧岗位列表，右侧 JD 详情 + 匹配分析 + 官方投递入口。支持即时搜索与本地翻页（共 {totalAll} 家）。
      </div>

      <div className="ctable-wrap">
        <div className="ctable-tools">
          <input
            className="search-input"
            placeholder="🔍 搜索公司名 / 行业 / 地点，如：腾讯、互联网、北京"
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
          />
          <select
            className="sel"
            value={batch}
            onChange={(e) => { setBatch(e.target.value); setPage(1); }}
          >
            <option value="">全部招聘批次</option>
            {batches.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
          <select
            className="sel"
            value={nature}
            onChange={(e) => { setNature(e.target.value); setPage(1); }}
          >
            <option value="">全部企业性质</option>
            {natures.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <span className="c-count">
            共 <b>{total}</b> 家公司
            {total !== totalAll ? `（已从 ${totalAll} 家筛选）` : ""}
          </span>
          {natures.includes("个人投递") && (
            <span
              className="btn sm"
              style={{ cursor: "pointer" }}
              onClick={async () => {
                if (!confirm("确定删除招聘库中所有「个人投递」性质的公司吗？关联投递会保留（仅解绑公司）。")) return;
                const r = await prunePersonalCompanies();
                alert(r.ok ? `已删除 ${r.removed} 家个人投递公司` : (r.msg || "操作失败"));
                if (r.ok) window.location.reload();
              }}
            >
              🧹 清理个人投递
            </span>
          )}
        </div>

        <table>
          <thead>
            <tr>
              <th style={{ width: "19%" }}>公司</th>
              <th style={{ width: "8%" }}>企业性质</th>
              <th style={{ width: "12%" }}>行业</th>
              <th style={{ width: "10%" }}>招聘批次</th>
              <th style={{ width: "9%" }}>招聘对象</th>
              <th style={{ width: "13%" }}>工作地点</th>
              <th style={{ width: "7%" }}>岗位</th>
              <th style={{ width: "9%" }}>更新时间</th>
              <th style={{ width: "13%" }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((c) => {
              const n = parseJobs(c.positions || "").length || 1;
              return (
                <tr key={c.id}>
                  <td>
                    <b>{c.name}</b>
                  </td>
                  <td>
                    <span className="badge b-gray">{c.nature || "—"}</span>
                  </td>
                  <td>
                    <span className="cell-ellipsis" title={c.industry || ""}>
                      {c.industry || "—"}
                    </span>
                  </td>
                  <td>
                    <span className="badge b-terra">{c.batch || "—"}</span>
                  </td>
                  <td>{c.target || "—"}</td>
                  <td>
                    <span
                      className="cell-ellipsis wide"
                      title={c.location || ""}
                    >
                      {c.location || "—"}
                    </span>
                  </td>
                  <td>
                    <b>{n}</b> 个
                  </td>
                  <td className="hint">{c.updateDate || "—"}</td>
                  <td>
                    <span
                      className="btn sm mocklink"
                      style={{ marginRight: 6 }}
                      onClick={() => openModal(c)}
                    >
                      查看岗位
                    </span>
                    <button
                      className="btn sm"
                      style={{
                        marginRight: 6,
                        color: fav[c.id] ? "var(--sand)" : "var(--sub)",
                        borderColor: fav[c.id] ? "var(--sand)" : "var(--line)",
                      }}
                      title={fav[c.id] ? "取消收藏" : "收藏此公司 / JD"}
                      onClick={() => toggleFav(c.id)}
                      disabled={favPend === c.id}
                    >
                      {favPend === c.id ? "…" : fav[c.id] ? "★" : "☆"}
                    </button>
                    <a
                      className="btn primary sm"
                      href={c.applyLink || "#"}
                      target="_blank"
                      rel="noopener"
                      onClick={(e) => e.stopPropagation()}
                    >
                      招聘官网
                    </a>
                  </td>
                </tr>
              );
            })}
            {companies.length === 0 && (
              <tr>
                <td colSpan={9} className="hint" style={{ textAlign: "center", padding: 24 }}>
                  没有匹配的公司，换个关键词试试。
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="pager">
          <span
            className="pg-btn"
            onClick={() => goto(1)}
            style={{ opacity: safePage <= 1 ? 0.4 : 1, pointerEvents: safePage <= 1 ? "none" : "auto", cursor: "pointer" }}
          >
            « 首页
          </span>
          <span
            className="pg-btn"
            onClick={() => goto(safePage - 1)}
            style={{ opacity: safePage <= 1 ? 0.4 : 1, pointerEvents: safePage <= 1 ? "none" : "auto", cursor: "pointer" }}
          >
            ‹ 上一页
          </span>
          {Array.from({ length: pages }, (_, i) => i + 1)
            .filter((p) => Math.abs(p - safePage) <= 3)
            .map((p) => (
              <span
                key={p}
                onClick={() => goto(p)}
                className={"pg-btn" + (p === safePage ? " cur" : "")}
                style={{ cursor: "pointer" }}
              >
                {p}
              </span>
            ))}
          <span
            className="pg-btn"
            onClick={() => goto(safePage + 1)}
            style={{ opacity: safePage >= pages ? 0.4 : 1, pointerEvents: safePage >= pages ? "none" : "auto", cursor: "pointer" }}
          >
            下一页 ›
          </span>
          <span
            className="pg-btn"
            onClick={() => goto(pages)}
            style={{ opacity: safePage >= pages ? 0.4 : 1, pointerEvents: safePage >= pages ? "none" : "auto", cursor: "pointer" }}
          >
            末页 »
          </span>
          <span className="pg-info">
            第 {safePage} / {pages} 页 · 每页 {PAGE} 条 · 共 {total} 家
          </span>
        </div>
      </div>

      {/* 公司岗位小窗 */}
      <div
        className={"modal-mask" + (modalOpen ? " open" : "")}
        onClick={(e) => {
          if (e.target === e.currentTarget) setModalOpen(false);
        }}
      >
        {cur && (
          <div className="modal">
            <div className="modal-head">
              <h2>{cur.name}</h2>
              <span style={{ flex: 1 }}></span>
              <button
                className="btn sm"
                style={{
                  marginRight: 8,
                  color: fav[cur.id] ? "var(--sand)" : "var(--sub)",
                  borderColor: fav[cur.id] ? "var(--sand)" : "var(--line)",
                }}
                onClick={() => toggleFav(cur.id)}
                disabled={favPend === cur.id}
              >
                {favPend === cur.id ? "…" : fav[cur.id] ? "★ 已收藏" : "☆ 收藏"}
              </button>
              <span className="badge b-sage">{cur.batch || "—"}</span>
              <span className="badge b-dusty">{cur.nature || "—"}</span>
              <button className="close-btn" onClick={() => setModalOpen(false)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="joblist">
                <div className="jl-head">
                  {jobs.length
                    ? `共 ${jobs.length} 个岗位方向 · 点击查看 JD 与匹配`
                    : "来源未提供岗位明细"}
                </div>
                {jobs.length === 0 ? (
                  <div style={{ padding: 14, color: "var(--sub)", fontSize: 12.5 }}>
                    公司：{cur.name}
                    <br />
                    批次：{cur.batch || "—"}
                    <br />
                    对象：{cur.target || "—"}
                    <br />
                    地点：{cur.location || "—"}
                    <br />
                    更新：{cur.updateDate || "—"}
                    <br />
                    截止：{cur.deadline || "—"}
                    <br />
                    笔试：{cur.hasWrittenTest || "未标注"}
                  </div>
                ) : (
                  jobs.map((j, i) => {
                    const m = matchJob(`${j} ${cur.industry || ""}`);
                    return (
                      <div
                        key={i}
                        className={"jobitem" + (i === selJob ? " sel" : "")}
                        onClick={() => setSelJob(i)}
                      >
                        <span className={`j-match ${scoreCls(m.score)}`}>
                          {m.score}
                        </span>
                        <div className="j-title">{j}</div>
                        <div className="j-meta">
                          <span>{cur.location || "—"}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <div className="jd-scroll">
                <JobDetail />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}