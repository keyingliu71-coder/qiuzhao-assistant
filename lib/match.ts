// 原型级匹配引擎：关键词 × 证据库映射（真实版由 AI 替换）
export type Profile = { tag: string; kw: string[]; ev: string };
export type MatchResult = { score: number; hits: Profile[]; gaps: string[] };

export const PROFILE: Profile[] = [
  { tag: 'AI/大模型', kw: ['ai', '算法', '智能', '大模型', '软件', '开发', '工程', '机器学习', 'nlp', '数据科学'], ev: '智谱 AI 助教 97.2% · AI 编程作品' },
  { tag: '产品', kw: ['产品', 'pm', '需求', '产品经理'], ev: '校园二手平台 DAU1200+（0→1 产品）' },
  { tag: '数据分析', kw: ['数据', '分析', '商业分析', 'bi', '报表', '战略'], ev: '美团商业分析 ROI +18%' },
  { tag: '运营/增长', kw: ['运营', '营销', '市场', '增长', '策划'], ev: '二手平台运营增长 DAU1200+' },
  { tag: '项目/技术支持', kw: ['项目', '技术支持', '解决方案', '实施', '客户'], ev: '京东解决方案实习（项目交付）' },
];

export function matchJob(text?: string): MatchResult {
  const t = (text || '').toLowerCase();
  const hits = PROFILE.filter((p) => p.kw.some((k) => t.includes(k)));
  const score = Math.min(96, 52 + hits.length * 12);
  const gaps: string[] = [];
  if (!hits.some((h) => h.tag === 'AI/大模型')) gaps.push('AI/技术类证据不足');
  if (!hits.some((h) => h.tag === '数据分析')) gaps.push('数据分析证据未命中');
  if (score < 70) gaps.push('建议补充与岗位相关的 STAR 案例');
  return { score, hits, gaps };
}

export function scoreCls(s: number): string {
  return s >= 85 ? 'm-high' : s >= 65 ? 'm-mid' : 'm-low';
}

export function parseJobs(s?: string): string[] {
  if (!s) return [];
  return s.split(/[、,，\/|]/).map((x) => x.trim()).filter((x) => x.length > 1);
}

export function countJobs(s?: string): number {
  const arr = parseJobs(s);
  return arr.length || (s ? 1 : 0);
}
