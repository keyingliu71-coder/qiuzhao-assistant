import { resolve } from 'path';

(async () => {
  // 先加载 .env 中的 DATABASE_URL（Prisma 客户端构建时需要）
  try {
    // @ts-ignore Node 22 内置
    (process as any).loadEnvFile(resolve(__dirname, '..', '.env'));
  } catch {}

  const { runSyncOnce } = await import('../lib/sync');
  try {
    const r = await runSyncOnce();
    console.log('同步结果：', r);
    process.exit(0);
  } catch (e) {
    console.error('同步失败：', e);
    process.exit(1);
  }
})();
