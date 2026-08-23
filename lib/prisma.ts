import { PrismaClient } from '@prisma/client';

// 给 DATABASE_URL 追加 Prisma 连接参数：
//  - 若是 Neon 连接池端点（主机含 -pooler.）：开启 pgbouncer=true，Prisma 侧只留 1 条连接走池，
//    借助持久连接让计算节点保持 warm，显著降低 serverless 冷启动的"每次点击等 20~30s"问题。
//  - 若是直连端点：Neon 免费版连接数有限，connection_limit=3；放宽排队等待时间到 15s。
function withPool(url: string | undefined): string | undefined {
  if (!url) return url;
  try {
    const u = new URL(url);
    const isPooled = u.hostname.includes('-pooler.');
    if (isPooled) {
      // pgbouncer=true：Prisma 会按连接池语义工作（PG 事务级连接池）
      u.searchParams.set('pgbouncer', 'true');
      u.searchParams.set('connection_limit', '1');
      u.searchParams.set('connect_timeout', '25');
      u.searchParams.delete('connection_timeout');
    } else {
      if (!u.searchParams.has('connection_limit')) u.searchParams.set('connection_limit', '3');
      if (!u.searchParams.has('connection_timeout')) u.searchParams.set('connection_timeout', '15000');
    }
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