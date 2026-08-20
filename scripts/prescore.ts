import { resolve } from 'path';

(async () => {
  // 先加载 .env 中的 DATABASE_URL / AI_API_KEY
  try {
    // @ts-ignore Node 22 内置
    (process as any).loadEnvFile(resolve(__dirname, '..', '.env'));
  } catch {}

  const { prescorePending } = await import('../lib/sync');

  if (!process.env.AI_API_KEY) {
    console.error('AI 未配置：请在 .env 设置 AI_API_KEY（参照 .env.example）');
    process.exit(1);
  }

  let round = 0;
  while (round < 300) {
    const r = await prescorePending(50);
    if (r.skipped) {
      console.log('AI 未配置，退出。');
      break;
    }
    if (r.scored === 0) {
      console.log('全部公司已评分，完成。');
      break;
    }
    console.log(`第 ${round + 1} 轮：评分 ${r.scored} 家`);
    round++;
    await new Promise((res) => setTimeout(res, 1000));
  }
  process.exit(0);
})();
