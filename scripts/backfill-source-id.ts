import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();

async function main() {
  console.log('读取 offerio 原始数据（含 id）...');
  const raw = readFileSync(join(__dirname, '..', 'prisma', 'offerio.json'), 'utf-8');
  const list: { id: string; companyName: string }[] = JSON.parse(raw);
  console.log(`共 ${list.length} 条，逐条按「名称 + 未绑定」回填 sourceId（1:1）...`);

  let done = 0;
  let skipped = 0;
  for (const c of list) {
    // 仅取一条同名且尚未绑定 sourceId 的行，避免把同一 id 套到多行触发唯一约束
    const row = await prisma.company.findFirst({
      where: { name: c.companyName, sourceId: null },
      select: { id: true },
    });
    if (!row) {
      skipped++;
      continue;
    }
    await prisma.company.update({ where: { id: row.id }, data: { sourceId: c.id } });
    done++;
  }
  const withSource = await prisma.company.count({ where: { sourceId: { not: null } } });
  console.log(`回填完成：写入 ${done} 家，跳过（已全部绑定/无匹配）${skipped} 家；当前带 sourceId 的公司 = ${withSource}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
