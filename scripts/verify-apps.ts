import { resolve } from 'path';
import { PrismaClient } from '@prisma/client';
try { (process as any).loadEnvFile(resolve(__dirname, '..', '.env')); } catch {}
const p = new PrismaClient();
(async () => {
  const apps = await p.application.findMany({ include: { company: true }, orderBy: { createdAt: 'asc' } });
  console.log('count', apps.length);
  const byStage: Record<number, number> = {};
  for (const a of apps) byStage[a.stage] = (byStage[a.stage] || 0) + 1;
  console.log('byStage', JSON.stringify(byStage));
  for (const a of apps) {
    console.log(`${a.createdAt.toISOString().slice(0, 10)} | stage${a.stage} | ${a.jobTitle} | ${a.company ? a.company.name : ''}`);
  }
  await p.$disconnect();
})();
