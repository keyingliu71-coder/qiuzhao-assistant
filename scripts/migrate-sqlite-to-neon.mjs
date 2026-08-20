import { DatabaseSync } from "node:sqlite";
import pg from "pg";

const NEON_URL = process.env.DATABASE_URL || (() => { throw new Error("请在 DATABASE_URL 环境变量中提供 Neon 连接串"); })();
const DB_PATH = process.argv[2] || "prisma/dev.db";

const SCHEMA = [
'CREATE TABLE IF NOT EXISTS "User" ("id" TEXT PRIMARY KEY, "email" TEXT NOT NULL UNIQUE, "name" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)',
'CREATE TABLE IF NOT EXISTS "Company" ("id" TEXT PRIMARY KEY, "sourceId" TEXT UNIQUE, "name" TEXT NOT NULL, "nature" TEXT, "industry" TEXT, "batch" TEXT, "target" TEXT, "location" TEXT, "positions" TEXT, "updateDate" TEXT, "deadline" TEXT, "applyLink" TEXT, "hasWrittenTest" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "matchScore" INTEGER, "matchDetail" TEXT)',
'CREATE TABLE IF NOT EXISTS "Job" ("id" TEXT PRIMARY KEY, "companyId" TEXT NOT NULL, "title" TEXT NOT NULL, "location" TEXT, "department" TEXT, "education" TEXT, "batch" TEXT, "jdText" TEXT, "jdSource" TEXT, "scrapedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)',
'CREATE TABLE IF NOT EXISTS "Application" ("id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "jobId" TEXT, "companyId" TEXT, "jobTitle" TEXT NOT NULL, "stage" INTEGER NOT NULL DEFAULT 0, "stageName" TEXT NOT NULL DEFAULT ' + "'待投递'" + ', "subState" TEXT, "subTone" TEXT, "riskNote" TEXT, "priority" TEXT NOT NULL DEFAULT ' + "'中'" + ', "satisfaction" TEXT, "nextTodo" TEXT, "resumeVersion" TEXT, "sourceUrl" TEXT, "lastCheckedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL)',
'CREATE TABLE IF NOT EXISTS "ApplicationEvent" ("id" TEXT PRIMARY KEY, "applicationId" TEXT NOT NULL, "type" TEXT NOT NULL, "fromStage" INTEGER, "toStage" INTEGER, "note" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)',
'CREATE TABLE IF NOT EXISTS "Todo" ("id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "applicationId" TEXT, "text" TEXT NOT NULL, "done" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)',
'CREATE TABLE IF NOT EXISTS "Favorite" ("id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "companyId" TEXT NOT NULL, "note" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE ("userId","companyId"))',
'CREATE TABLE IF NOT EXISTS "SyncMeta" ("id" TEXT PRIMARY KEY, "signature" TEXT, "lastSyncAt" TIMESTAMP(3), "status" TEXT NOT NULL DEFAULT ' + "'idle'" + ', "lastError" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL)'
];

function conv(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && (v === 0 || v === 1)) return v;
  if (typeof v === "number" && Number.isInteger(v) && Math.abs(v) > 1e12) return new Date(v);
  if (typeof v === "string" && /^\d{13}$/.test(v.trim())) return new Date(Number(v.trim()));
  return v;
}

async function multiInsert(client, table, rows) {
  if (!rows.length) return 0;
  const cols = Object.keys(rows[0]);
  const colList = cols.map(c => `"${c}"`).join(",");
  const BATCH = 400;
  let inserted = 0, skipped = 0, failed = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const phs = [];
    const values = [];
    for (const row of batch) {
      const placeholders = cols.map((c, idx) => `$${values.length + idx + 1}`);
      phs.push("(" + placeholders.join(",") + ")");
      for (const c of cols) values.push(conv(row[c]));
    }
    const sql = `INSERT INTO "${table}" (${colList}) VALUES ${phs.join(",")} ON CONFLICT DO NOTHING`;
    try {
      const r = await client.query(sql, values);
      inserted += r.rowCount;
    } catch (e) {
      console.error("    BATCH FAILED " + table + " rows " + i + "-" + (i + batch.length) + ": " + e.message);
      failed += batch.length;
    }
  }
  console.log("  " + table + ": 新增 " + inserted + " / 跳过 " + skipped + " / 失败 " + failed + " / 源 " + rows.length);
  return inserted;
}

async function main() {
  console.log("读取本地 SQLite:", DB_PATH);
  const sqlite = new DatabaseSync(DB_PATH, { readOnly: true });
  const client = new pg.Client({ connectionString: NEON_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  for (const stmt of SCHEMA) await client.query(stmt);
  console.log("表结构就绪");

  const pick = (t) => sqlite.prepare(`SELECT * FROM "${t}"`).all();
  const tables = ["User", "Company", "Job", "Application", "ApplicationEvent", "Todo", "Favorite", "SyncMeta"];
  for (const table of tables) {
    try { await client.query(`TRUNCATE TABLE "${table}" CASCADE`); } catch (e) {}
    const rows = pick(table);
    if (!rows.length) { console.log("  " + table + ": 0 行"); continue; }
    await multiInsert(client, table, rows);
  }
  console.log("✅ 迁移完成");
  await client.end();
}

main().catch(e => { console.error("执行失败:", e); process.exit(1); });