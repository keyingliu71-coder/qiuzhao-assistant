import { prisma } from './prisma';
import { prescoreCompany, isAIConfigured } from './ai';

const API = 'https://offerio.work/api/recruitment/companies';
const PAGE_SIZE = 200;
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
    // 不缓存，确保拿到最新
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

async function setMeta(data: Partial<{ signature: string; lastSyncAt: Date; status: string; lastError: string }>) {
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

export type SyncResult = { created: number; updated: number; total: number; signature: string };

// 并发拉取剩余所有页（控制并发，避免打爆源站）
async function fetchRemainingPages(p1: Page): Promise<OfferioCompany[]> {
  const totalPages = p1.totalPages || 1;
  const pageSize = p1.pageSize || PAGE_SIZE;
  const all: OfferioCompany[] = [...p1.companies];
  const pages = Array.from({ length: Math.max(0, totalPages - 1) }, (_, i) => i + 2);
  const CONC = 5;
  for (let i = 0; i < pages.length; i += CONC) {
    const batch = pages.slice(i, i + CONC);
    const results = await Promise.all(batch.map((p) => fetchPage(p, pageSize)));
    for (const pg of results) all.push(...pg.companies);
  }
  return all;
}

// 全量同步（增量 upsert，保留个人投递/收藏/证据）
export async function runSyncOnce(): Promise<SyncResult> {
  await setMeta({ status: 'syncing' });
  console.log('[sync] 开始全量拉取 offerio...');

  const p1 = await fetchPage(1);
  const all = await fetchRemainingPages(p1);

  // 按 offerio id 去重（极端情况下接口可能返回重复）
  const map = new Map<string, OfferioCompany>();
  for (const c of all) if (c.id) map.set(c.id, c);
  const list = [...map.values()];

  const existing = await prisma.company.findMany({
    where: { sourceId: { not: null } },
    select: { sourceId: true },
  });
  const existingSet = new Set(existing.map((e) => e.sourceId));

  let created = 0;
  let updated = 0;
  const CHUNK = 200;
  const CONC_TX = 4;
  const chunks: OfferioCompany[][] = [];
  for (let i = 0; i < list.length; i += CHUNK) chunks.push(list.slice(i, i + CHUNK));
  for (let i = 0; i < chunks.length; i += CONC_TX) {
    const batch = chunks.slice(i, i + CONC_TX);
    await Promise.all(batch.map(async (slice) => {
      const ops = slice.map((c) => {
        const isNew = !existingSet.has(c.id);
        if (isNew) created++;
        else updated++;
        const data = normalize(c);
        return prisma.company.upsert({
          where: { sourceId: c.id },
          update: data,
          create: { sourceId: c.id, ...data },
        });
      });
      await prisma.$transaction(ops);
    }));
  }

  const signature = computeSignature(p1);
  await setMeta({ signature, status: 'ok', lastSyncAt: new Date() });
  console.log(`[sync] 完成：offerio 共 ${list.length} 家，本次新增 ${created} / 更新 ${updated}`);
  return { created, updated, total: list.length, signature };
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
        console.log(`[sync] 检测到更新并完成同步：新增 ${r.created} / 更新 ${r.updated}`);
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