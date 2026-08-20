import { PrismaClient } from '@prisma/client';

// 给 DATABASE_URL 追加 Prisma 连接池参数：
//  - connection_limit=3：Neon 免费版连接数有限，避免并发写库打爆连接池
//  - connection_timeout=15000：排队等连接时放宽到 15s，避免 "Timed out fetching a new connection"
function withPool(url: string | undefined): string | undefined {
  if (!url) return url;
  try {
    const u = new URL(url);
    if (!u.searchParams.has('connection_limit')) u.searchParams.set('connection_limit', '3');
    if (!u.searchParams.has('connection_timeout')) u.searchParams.set('connection_timeout', '15000');
    return u.toString();
  } catch {
    return url;
  }
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: { db: { url: withPool(process.env.DATABASE_URL) } },
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;