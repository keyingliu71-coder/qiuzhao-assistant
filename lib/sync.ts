import { randomUUID } from 'node:crypto';
import { prisma } from './prisma';
import { prescoreCompany, isAIConfigured } from './ai';

const API = 'https://offerio.work/api/recruitment/companies';
const PAGE_SIZE = 100; // 接口实际固定每页 100
const SINGLETON = 'singleton';

type OfferioCompany = {
  id: string;
  companyName: string;
  companyNature?: string;
  industry?: string;
  batch?: string;
  target?: string;
  location?: string;
  positions?: string;
  updateDate?: string;
  deadline?: string;
  applyLink?: string;
  hasWrittenTest?: string;
};

type Page = {
  companies: OfferioCompany[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

async function fetchPage(page: number, pageSize = PAGE_SIZE): Promise<Page> {
  const url = `${API}?page=${page}&pageSize=${pageSize}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (QiuzhaoCompanion auto-sync)' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`offerio 返回 HTTP ${res.status}`);
  return (await res.json()) as Page;
}

function computeSignature(p1: Page): string {
  const first = p1.companies?.[0];
  return `${p1.total}|${p1.totalPages}|${first?.id ?? ''}|${first?.updateDate ?? ''}`;
}

function normalize(c: OfferioCompany) {
  return {
    name: c.companyName,
    nature: c.companyNature ?? null,
    industry: c.industry ?? null,
    batch: c.batch ?? null,
    target: c.target ?? null,
    location: c.location ?? null,
    positions: c.positions ?? null,
    updateDate: c.updateDate ?? null,
    deadline: c.deadline ?? null,
    applyLink: c.applyLink ?? null,
    hasWrittenTest: c.hasWrittenTest ?? null,
  };
}

async function getMeta() {
  return prisma.syncMeta.findUnique({ where: { id: SINGLETON } });
}

async function setMeta(data: Partial<{ signature: string; lastSyncAt: Date; status: string; lastError: string; cursor: number }>) {
  return prisma.syncMeta.upsert({
    where: { id: SINGLETON },
    update: data,
    create: { id: SINGLETON, ...data },
  });
}

// 廉价判断：只拉第 1 页，对比指纹。内容无变化则不需全量拉取
export async function isChanged(): Promise<boolean> {
  const p1 = await fetchPage(1);
  const sig = computeSignature(p1);
  const meta = await getMeta();
  if (!meta?.signature) return true;
  return meta.signature !== sig;
}

export type SyncResult = { created: number; updated: number; total: number; signature: string; cursor: number; done: boolean };

// 原生批量 upsert：一条 SQL 写入一整批，避免逐条 upsert 长时间占用连接
async function bulkUpsert(companies: OfferioCompany[], existingSet: Set<string>) {
  const COLS = ['id', 'sourceId', 'name', 'nature', 'industry', 'batch', 'target', 'location', 'positions', 'updateDate', 'deadline', 'applyLink', 'hasWrittenTest', 'matchScore', 'matchDetail'];
  const colList = COLS.map((c) => `"${c}"`).join(', ');
  const updateSet = ['name', 'nature', 'industry', 'batch', 'target', 'location', 'positions', 'updateDate', 'deadline', 'applyLink', 'hasWrittenTest', 'matchScore', 'matchDetail']
    .map((c) => `"${c}" = EXCLUDED."${c}"`)
    .join(', ');
  const BATCH = 300;

  let created = 0;
  let updated = 0;
  for (let i = 0; i < companies.length; i += BATCH) {
    const slice = companies.slice(i, i + BATCH);
    const phs: string[] = [];
    const values: unknown[] = [];
    for (const c of slice) {
      const d = normalize(c);
      // matchScore/matchDetail 置于 NULL：数据一旦变更即被重新拉入预评分队列，
      // 让「根据经历库匹配 JD」的分数始终跟随最新经历库与最新岗位数据（不再停留在旧评分）。
      const row = [randomUUID(), c.id, d.name, d.nature, d.industry, d.batch, d.target, d.location, d.positions, d.updateDate, d.deadline, d.applyLink, d.hasWrittenTest, null, null];
      phs.push(`(${row.map((_, j) => `$${values.length + j + 1}`).join(', ')})`);
      values.push(...row);
      if (existingSet.has(c.id)) updated++;
      else created++;
    }
    const sql = `INSERT INTO "Company" (${colList}) VALUES ${phs.join(', ')} ON CONFLICT ("sourceId") DO UPDATE SET ${updateSet}`;
    await prisma.$executeRawUnsafe(sql, ...values);
  }
  return { created, updated };
}

// 单轮同步：
//  - 尚未全量跑完（cursor 未达末尾）→ 本轮继续拉后续页面
//  - 已全量跑完 → 只做增量：拉前 PAGE_LIMIT 页（最近更新）
const PAGE_LIMIT = 10; // 单轮最多拉 10 页（约 1000 家），保证 Vercel 60s 内完成

export async function runSyncOnce(): Promise<SyncResult> {
  const meta = await getMeta();
  const hasEverSynced = !!meta?.signature;

  const p1 = await fetchPage(1);
  const totalPages = p1.totalPages || 1;

  // 决定本轮拉取范围：
  //  - 首次同步：从上次游标继续，每轮 PAGE_LIMIT 页，直到全量拉完（避免单次执行超时）
  //  - 已同步过：以后每轮都刷新最前面的 PAGE_LIMIT 页（最近更新），保证“最新岗位”紧跟源头
  const cursor = meta?.cursor ?? 1;
  const fromPage: number = hasEverSynced ? 1 : cursor;
  const toPage: number = hasEverSynced
    ? Math.min(PAGE_LIMIT, totalPages)
    : Math.min(cursor + PAGE_LIMIT - 1, totalPages);

  console.log(`[sync] 本轮拉取 page ${fromPage}..${toPage} / ${totalPages}`);
  await setMeta({ status: 'syncing', cursor: fromPage });

  const all: OfferioCompany[] = [];
  const pages: number[] = [];
  for (let p = fromPage; p <= toPage; p++) pages.push(p);
  const CONC = 4;
  for (let i = 0; i < pages.length; i += CONC) {
    const batch = pages.slice(i, i + CONC);
    const results = await Promise.all(batch.map((p) => fetchPage(p)));
    for (const pg of results) all.push(...pg.companies);
  }

  // 按 offerio id 去重
  const map = new Map<string, OfferioCompany>();
  for (const c of all) if (c.id) map.set(c.id, c);
  const list = [...map.values()];

  const existing = await prisma.company.findMany({
    where: { sourceId: { not: null } },
    select: { sourceId: true },
  });
  const existingSet = new Set<string>(existing.map((e) => e.sourceId).filter((v): v is string => !!v));

  const { created, updated } = await bulkUpsert(list, existingSet);

  const done = toPage >= totalPages;
  // 签名只在“真正刷新过第 1 页”（fromPage===1）或“首次全量跑完”（done）时才更新；
  // 否则保留旧值，避免“签名看似最新、数据却仍陈旧”导致永不重同步。
  const signature = fromPage === 1 || done ? computeSignature(p1) : meta?.signature ?? null;
  const finalCursor = done ? totalPages : toPage + 1;

  await setMeta({
    signature: signature ?? undefined,
    cursor: finalCursor,
    status: 'ok',
    lastSyncAt: new Date(),
  });

  console.log(`[sync] 完成：拉取 ${list.length} 家，新增 ${created} / 更新 ${updated}，done=${done}`);
  return { created, updated, total: list.length, signature: signature ?? '', cursor: finalCursor, done };
}

// 后台批量预评分：对尚未评分（matchScore 为 null）的公司跑 AI 预评分并写库。
// 受每日预算与限速保护；AI 未配置时静默跳过。可由自动同步 tick 或 npm run ai:prescore 触发。
export async function prescorePending(limit = 20): Promise<{ scored: number; skipped: boolean }> {
  if (!isAIConfigured()) {
    return { scored: 0, skipped: true };
  }
  const pending = await prisma.company.findMany({
    where: { matchScore: null },
    orderBy: { updateDate: "desc" },
    take: limit,
  });
  if (pending.length === 0) return { scored: 0, skipped: false };

  let scored = 0;
  for (const c of pending) {
    try {
      const r = await prescoreCompany({
        name: c.name,
        industry: c.industry,
        location: c.location,
        positions: c.positions,
        target: c.target,
        batch: c.batch,
      });
      const detail = JSON.stringify({ summary: r.summary, evidence: r.evidence, gaps: r.gaps });
      await prisma.company.update({
        where: { id: c.id },
        data: { matchScore: r.score, matchDetail: detail },
      });
      scored++;
      // 礼貌限速，避免触发接口限流
      await new Promise((res) => setTimeout(res, 250));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      // 预算耗尽等可恢复错误：停止本轮
      console.error(`[prescore] ${c.name} 失败：${msg}`);
      if (msg.includes("预算")) break;
    }
  }
  console.log(`[prescore] 本轮完成 ${scored} 家预评分`);
  return { scored, skipped: false };
}

// 轮询器：识别到更新再全量同步；默认每 15 分钟检查一次
export function startAutoSync(intervalMs = 15 * 60 * 1000) {
  const g = globalThis as unknown as { __autosync_started?: boolean };
  if (g.__autosync_started) return;
  g.__autosync_started = true;

  console.log(`[sync] 自动同步轮询器已启动，每 ${Math.round(intervalMs / 1000)} 秒检查一次 offerio 更新`);

  const tick = async () => {
    try {
      const changed = await isChanged();
      if (changed) {
        const r = await runSyncOnce();
        console.log(`[sync] 检测到更新并完成同步：新增 ${r.created} / 更新 ${r.updated}，done=${r.done}`);
      }
      // 同步后顺带消化待评分队列（AI 未配置时自动跳过）
      await prescorePending(20).catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[prescore] tick 出错：", msg);
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[sync] 轮询出错：', msg);
      await setMeta({ status: 'error', lastError: msg }).catch(() => {});
    }
  };

  void tick(); // 启动即检查一次
  setInterval(tick, intervalMs);
}