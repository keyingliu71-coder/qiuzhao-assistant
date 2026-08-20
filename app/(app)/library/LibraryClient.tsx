"use client";

import { useState, useTransition } from "react";
import { applyEvidenceSuggestion } from "@/app/(app)/actions";

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

type FavRow = {
  id: string;
  companyId: string;
  companyName: string;
  nature?: string | null;
  batch?: string | null;
  location?: string | null;
  positions?: string | null;
};

const SECTIONS = [
  { key: "evidence", ico: "🧠", txt: "证据库（统一事实）", evidence: true },
  { key: "maincv", ico: "📄", txt: "主简历" },
  { key: "subcv", ico: "📑", txt: "定向简历" },
  { key: "fav", ico: "⭐", txt: "收藏" },
  { key: "proj", ico: "🧩", txt: "实习·项目证据" },
  { key: "star", ico: "⭐", txt: "STAR 案例" },
  { key: "interview", ico: "🎤", txt: "面试记录" },
  { key: "work", ico: "💻", txt: "AI 编程作品" },
  { key: "files", ico: "🗃", txt: "文件·链接" },
];

function YN({ v, yes = "是", no = "否" }: { v?: boolean | null; yes?: string; no?: string }) {
  if (v === true) return <span className="badge b-sage">{yes}</span>;
  if (v === false) return <span className="badge b-gray">{no}</span>;
  return <span className="badge b-sand">部分</span>;
}
function DefBadge({ v }: { v?: string | null }) {
  if (!v) return <span className="badge b-gray">未评</span>;
  if (v.includes("高") && v.includes("风险")) return <span className="badge b-rose">{v}</span>;
  if (v === "高") return <span className="badge b-sage">高</span>;
  return <span className="badge b-sand">{v}</span>;
}

export default function LibraryClient({
  evidence,
  favorites,
}: {
  evidence: EvRow[];
  favorites: FavRow[];
}) {
  const [lib, setLib] = useState("evidence");
  const [confirming, setConfirming] = useState(false);
  const [, start] = useTransition();
  const risk = evidence.find((e) => e.defenseLevel === "面试高风险" || e.risk);

  function confirmSuggestion() {
    if (!risk) return;
    start(async () => {
      await applyEvidenceSuggestion(risk.fact);
      setConfirming(true);
    });
  }

  return (
    <div className="page">
      <div className="toolbar">
        <h1 className="pagetitle" style={{ margin: 0 }}>
          资料库 · 证据库
        </h1>
        <span style={{ flex: 1 }}></span>
        <span className="hint">证据库为统一事实中枢，AI 只读不改</span>
      </div>

      <div className="lib-layout">
        <div className="lib-side" id="libTabs">
          <div className="ls-title">资料分区</div>
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              className={
                "ltab" +
                (s.evidence ? " evidence-tab" : "") +
                (lib === s.key ? " active" : "")
              }
              onClick={() => setLib(s.key)}
            >
              <span className="li-ico">{s.ico}</span>
              {s.txt}
            </button>
          ))}
        </div>

        <div className="lib-content">
          {lib === "evidence" ? (
            <>
              {risk && !confirming && (
                <div className="suggest-box">
                  <h4>📩 建议更新（需你确认才生效，AI 永不静默篡改事实）</h4>
                  <div className="row" style={{ alignItems: "flex-start", gap: 12 }}>
                    <div style={{ flex: 1, fontSize: 13 }}>
                      <b>{risk.fact}</b> 在 AI 面被追问时口径不足
                      <br />
                      <span className="hint">
                        建议状态：简历可用 → 面试高风险（defense_level 降级）
                      </span>
                    </div>
                    <div className="row" style={{ gap: 8 }}>
                      <button className="btn primary sm" onClick={confirmSuggestion}>
                        确认更新
                      </button>
                      <button
                        className="btn sm"
                        onClick={() => setConfirming(true)}
                      >
                        暂不更新
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {risk && confirming && (
                <div className="note" style={{ marginBottom: 16 }}>
                  ✅ 已确认更新：证据库状态已改为「面试高风险」。
                </div>
              )}
              <div className="ctable-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>事实内容</th>
                      <th>所属经历</th>
                      <th>来源文件</th>
                      <th>已确认</th>
                      <th>可写简历</th>
                      <th>面试防御</th>
                      <th>指标完整</th>
                      <th>个人贡献</th>
                      <th>被用岗位</th>
                      <th>风险提示</th>
                    </tr>
                  </thead>
                  <tbody>
                    {evidence.map((e) => (
                      <tr key={e.id}>
                        <td>{e.fact}</td>
                        <td>{e.experience || "—"}</td>
                        <td>{e.sourceFile || "—"}</td>
                        <td><YN v={e.confirmed} yes="是" no="待确认" /></td>
                        <td><YN v={e.writable} yes="可" no="否" /></td>
                        <td><DefBadge v={e.defenseLevel} /></td>
                        <td><YN v={e.metricOk} yes="完整" no="部分" /></td>
                        <td><YN v={e.contributionOk} yes="明确" no="模糊" /></td>
                        <td>—</td>
                        <td>{e.risk || "—"}</td>
                      </tr>
                    ))}
                    {evidence.length === 0 && (
                      <tr>
                        <td colSpan={10} className="hint" style={{ textAlign: "center", padding: 20 }}>
                          证据库暂无数据。
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : lib === "fav" ? (
            <>
              <h3>收藏（来自公司招聘库「★ 收藏」）</h3>
              <div className="hint" style={{ marginBottom: 12 }}>
                你在公司招聘库点「☆ 收藏」的公司 / JD 会汇总到这里，方便统一跟进、做行业对比与定向准备。
              </div>
              {favorites.length === 0 ? (
                <div className="panel">
                  <div className="hint">
                    还没有收藏。去
                    <a href="/companies" style={{ color: "var(--sage)", fontWeight: 600 }}>
                      公司招聘库
                    </a>
                    点任意公司的「☆ 收藏」即可。
                  </div>
                </div>
              ) : (
                <div className="ctable-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>公司</th>
                        <th>企业性质</th>
                        <th>批次</th>
                        <th>地点</th>
                        <th>岗位方向</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {favorites.map((f) => (
                        <tr key={f.id}>
                          <td>
                            <b>{f.companyName}</b>
                          </td>
                          <td>
                            <span className="badge b-gray">{f.nature || "—"}</span>
                          </td>
                          <td>
                            <span className="badge b-terra">{f.batch || "—"}</span>
                          </td>
                          <td>{f.location || "—"}</td>
                          <td className="cell-ellipsis wide" title={f.positions || ""}>
                            {f.positions || "—"}
                          </td>
                          <td>
                            <a
                              className="btn primary sm"
                              href={`/companies?open=${f.companyId}`}
                            >
                              查看岗位 →
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <div className="panel">
              <h3>
                {SECTIONS.find((s) => s.key === lib)?.txt}（示意）
              </h3>
              <div className="hint">
                此分区为示意，真实数据将在网站搭建阶段导入。结构：主简历母版 + 派生定向简历；JD
                / 实习项目 / STAR / 面试记录 / AI 作品 / 文件链接 分类存放。
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
