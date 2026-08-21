import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { scoreCls } from "@/lib/match";
import { getScore } from "@/lib/score";
import { STAGE_NAMES } from "@/lib/constants";
import AddToBoardButton from "../components/AddToBoardButton";
import DeliveryVizModal from "../components/DeliveryVizModal";
import InspectionBlock from "../components/InspectionBlock";

export const dynamic = "force-dynamic";

function todayLabel() {
  const d = new Date();
  const wk = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][d.getDay()];
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${wk}`;
}

// 本地时区日期（YYYY-MM-DD）
function localDateStr(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export default async function DashboardPage() {
  const user = await prisma.user.findFirst();
  const totalCompanies = await prisma.company.count();

  // 真实「今日」（offerio 使用 YYYY/MM/DD）
  const now = new Date();
  const p2 = (n: number) => String(n).padStart(2, "0");
  const todayStr = `${now.getFullYear()}/${p2(now.getMonth() + 1)}/${p2(now.getDate())}`;

  const recent = await prisma.company.findMany({
    where: { updateDate: { not: null } },
    orderBy: { updateDate: "desc" },
    take: 60,
  });
  const lastDate = recent[0]?.updateDate ?? "";

  const todayList = await prisma.company.findMany({
    where: { updateDate: todayStr },
    orderBy: { name: "asc" },
  });
  const isToday = todayList.length > 0;
  const newList = isToday ? todayList : recent;
  const newCount = newList.length;
  const newDateLabel = isToday ? todayStr : lastDate;
  const newShow = newList.slice(0, 6);

  // 自动同步状态
  const syncMeta = await prisma.syncMeta.findUnique({ where: { id: "singleton" } });
  const lastSync = syncMeta?.lastSyncAt
    ? syncMeta.lastSyncAt.toLocaleString("zh-CN", { hour12: false })
    : "尚未同步";

  const apps = await prisma.application.findMany({
    orderBy: { createdAt: "desc" },
    include: { company: true },
  });

  const funnel = STAGE_NAMES.map((_, i) => apps.filter((a) => a.stage === i).length);
  const todoApps = apps.filter((a) => a.nextTodo && a.stage < 4);
  const riskCount = apps.filter((a) => a.riskNote).length;
  const pendingCount = apps.filter((a) => a.stage === 0).length;
  const needResume = apps.filter(
    (a) => a.nextTodo?.includes("简历") || a.subState?.includes("待定制")
  ).length;

  const highMatch = newList.filter((c) => getScore(c).score >= 85).length;

  const reviewN = apps.filter((a) => (a.subState || "").includes("复盘")).length;
  const testN = apps.filter((a) => (a.nextTodo || a.subState || "").includes("测评")).length;
  const prepN = apps.filter((a) => (a.nextTodo || a.subState || "").includes("面试准备")).length;

  // ===== 投递进度可视化数据 =====
  const delivered = apps.filter((a) => a.stage >= 1);
  const deliveredCompanies = new Set(delivered.map((a) => a.companyId)).size;
  const todayLocal = localDateStr(now);
  const todayDelivered = delivered.filter((a) => localDateStr(a.createdAt) === todayLocal);
  const todayCompanies = new Set(todayDelivered.map((a) => a.companyId)).size;
  const progressApps = delivered.filter((a) => a.stage === 2 || a.stage === 3);
  const endedApps = delivered.filter((a) => a.stage === 4);
  const stage2N = apps.filter((a) => a.stage === 2).length;
  const stage3N = apps.filter((a) => a.stage === 3).length;

  const vizData = apps.map((a) => ({
    id: a.id,
    companyName: a.company?.name ?? "",
    jobTitle: a.jobTitle,
    stage: a.stage,
    subState: a.subState,
    subTone: a.subTone,
    createdAt: a.createdAt.toISOString(),
    sourceUrl: a.sourceUrl,
  }));

  // ===== 巡检队列：投递 3 天后开始，每 3 天一次，先投递先巡检 =====
  const inspectItems = apps
    .filter((a) => a.stage === 1 || a.stage === 2 || a.stage === 3)
    .map((a) => {
      const base = a.lastCheckedAt ?? a.createdAt;
      const next = new Date(base.getTime() + 3 * DAY_MS);
      return { app: a, next };
    })
    .filter((x) => x.next <= now) // 到期才进入巡检队列
    .sort((x, y) => (x.app.createdAt < y.app.createdAt ? -1 : 1)) // 先投递先巡检
    .map(({ app, next }) => ({
      id: app.id,
      companyName: app.company?.name ?? "",
      jobTitle: app.jobTitle,
      sourceUrl: app.sourceUrl,
      appliedOn: localDateStr(app.createdAt),
      dueOn: localDateStr(next),
      overdueDays: Math.max(0, Math.floor((now.getTime() - next.getTime()) / DAY_MS)),
      stageName: app.stageName,
      subState: app.subState,
    }));

  return (
    <div className="page">
      <div className="toolbar">
        <h1 className="pagetitle" style={{ margin: 0 }}>
          早上好，{user?.name || "可颖"} 🌿
        </h1>
        <span style={{ flex: 1 }}></span>
        <span className="realdata-tag">● 真实数据</span>
        <span className="hint">{todayLabel()}</span>
        <span className="realdata-tag" style={{ opacity: 0.9 }}>
          自动同步 · 上次：{lastSync}
        </span>
      </div>
      <div className="pagedesc">
        每天醒来的第一站：10 秒看清今天的新机会、要紧事和进度。
      </div>

      <div className="stat-grid">
        <div className="stat-card hero">
          <div className="s-label">
            {isToday ? "今日新开放岗位" : `最新更新（${newDateLabel}）`}{" "}
            <span className="badge b-terra">筛选前已评分</span>
          </div>
          <div className="s-num">{newCount}</div>
          <div className="s-sub">
            来自 {newShow.length} 家公司 · 高匹配 {highMatch} 个
          </div>
        </div>
        <div className="stat-card viz-card" style={{ position: "relative" }}>
          <div className="s-label">今日投递</div>
          <div className="s-num">
            {todayCompanies} <span style={{ fontSize: 13, color: "var(--sub)", fontWeight: 400 }}>家</span>
          </div>
          <div className="s-sub">累计投递 {delivered.length} 岗 / {deliveredCompanies} 家</div>
          <DeliveryVizModal apps={vizData} />
        </div>
        <div className="stat-card">
          <div className="s-label">有进展（初筛/流程中）</div>
          <div className="s-num" style={{ color: "var(--dusty)" }}>
            {progressApps.length}
          </div>
          <div className="s-sub">流程前期 {stage2N} · 流程后期 {stage3N}</div>
        </div>
        <div className="stat-card">
          <div className="s-label">已结束流程</div>
          <div className="s-num" style={{ color: "var(--rose)" }}>
            {endedApps.length}
          </div>
          <div className="s-sub">待投递 {pendingCount} · 有风险 {riskCount}</div>
        </div>
      </div>

            <div className="panel" style={{ marginBottom: 16 }}>
        <h3>
          🤖 AI 工作台 <Link href="/ai" className="more">进入 →</Link>
        </h3>
        <div className="row" style={{ gap: 14, alignItems: "stretch" }}>
          <div className="skill-card">
            <span className="sk-ico">📝</span>
            <div className="sk-name">简历制作 Skill</div>
            <div className="sk-desc">
              按 JD 生成 / 修改定向简历，输出"命中证据 + 缺口"，产出可直接投递的版本。
            </div>
            <Link href="/ai" className="btn primary sm" style={{ alignSelf: "flex-start" }}>
              去使用 →
            </Link>
          </div>
          <div className="skill-card sk2">
            <span className="sk-ico">🎤</span>
            <div className="sk-name">面试 Skill</div>
            <div className="sk-desc">
              面试问题预测 · 模拟面试 · 真实转写复盘，复盘结论经你确认后回写证据库。
            </div>
            <Link href="/ai" className="btn primary sm" style={{ alignSelf: "flex-start" }}>
              去使用 →
            </Link>
          </div>
        </div>
      </div>

      <div className="dash-2col">
        <div className="panel">
          <h3>
            🌱 {isToday ? "今日新开放岗位" : `最新更新（${newDateLabel}）`}（匹配度已预评）{" "}
            <span className="more">查看全部 {newCount} 个 →</span>
          </h3>
          <div className="note" style={{ margin: "0 0 10px" }}>
            匹配度由 AI 在岗位入库时<strong>自动预评分</strong>，筛选前即可见，不用逐个点开 JD。
          </div>
          {newShow.map((c) => {
            const m = getScore(c);
            return (
              <div className="newjob" key={c.id}>
                <span
                  className={`matchscore ${scoreCls(m.score)}`}
                  title={m.real ? "AI 预评分" : "预估（AI 评分进行中）"}
                >
                  {m.score}
                </span>
                <div className="nj-info">
                  <div className="nj-title">{c.name}</div>
                  <div className="nj-sub">
                    {c.location || "—"} · {c.batch || "—"} · 截止 {c.deadline || "—"}
                  </div>
                </div>
                <Link href={`/companies?open=${c.id}`} className="btn sm mocklink">
                  看JD
                </Link>
                <AddToBoardButton companyId={c.id} jobTitle={c.name} />
              </div>
            );
          })}
          <div className="hint" style={{ marginTop: 9 }}>
            匹配度色标：≥85 绿 · 65–84 黄 · &lt;65 灰。点分数可看"命中证据+缺口"。
          </div>
        </div>

        <div className="panel">
          <h3>🔍 巡检待办</h3>
          <InspectionBlock items={inspectItems} />
          <h3 style={{ marginTop: 18 }}>✅ 今日待办</h3>
          {todoApps.slice(0, 6).map((a) => (
            <div className="todo-item" key={a.id}>
              <span className="t-dot"></span>
              {a.jobTitle} —— {a.nextTodo}
              {a.subState ? (
                <span className="badge b-terra" style={{ marginLeft: "auto" }}>
                  {a.subState}
                </span>
              ) : null}
            </div>
          ))}
          {todoApps.length === 0 && (
            <div className="hint">暂无待办，去公司库加点岗位吧。</div>
          )}
          <h3 style={{ marginTop: 18 }}>⏳ 待复盘 / 待测评 / 待准备</h3>
          <div className="row" style={{ gap: 8 }}>
            <span className="badge b-rose">待复盘 {reviewN}</span>
            <span className="badge b-terra">待完成测评 {testN}</span>
            <span className="badge b-dusty">待准备面试 {prepN}</span>
          </div>
          <h3 style={{ marginTop: 18 }}>📉 投递漏斗</h3>
          <div className="funnel">
            {funnel.map((n, i) => (
              <span key={i} style={{ display: "contents" }}>
                {i > 0 && <span className="f-arrow">→</span>}
                <div className="f-stage">
                  <b>{n}</b>
                  {STAGE_NAMES[i]}
                </div>
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="footer-note">
        公司招聘库数据实时同步自 offerio（共 {totalCompanies} 家），每日自动更新。投递看板数据来自你的飞书求职台账（共 {delivered.length} 条已投递）。
      </div>
    </div>
  );
}
