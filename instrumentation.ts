export async function register() {
  // 仅在 Node 运行时启动自动同步轮询器（浏览器端不执行）
  if (process.env.NEXT_RUNTIME === 'node.js') {
    const { startAutoSync } = await import('./lib/sync');
    startAutoSync();
  }
}
