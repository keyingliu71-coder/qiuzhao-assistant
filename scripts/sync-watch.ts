import { resolve } from 'path';

(async () => {
  // 先加载 .env 中的 DATABASE_URL
  try {
    // @ts-ignore Node 22 内置
    (process as any).loadEnvFile(resolve(__dirname, '..', '.env'));
  } catch {}

  const { startAutoSync } = await import('../lib/sync');
  // 作为独立守护进程运行（每 15 分钟检查一次 offerio 更新）
  startAutoSync(15 * 60 * 1000);
  // 保持进程常驻
  setInterval(() => {}, 1 << 30);
})();
