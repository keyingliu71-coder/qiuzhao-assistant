import { matchJob } from "./match";

// 统一取匹配分：有 AI 真实预评分(matchScore)用真实的，否则降级到占位引擎。
// 这样 UI 永远有数字显示，真实分数在后台预评分完成后逐步覆盖。
export function getScore(c: {
  name: string;
  industry?: string | null;
  positions?: string | null;
  matchScore?: number | null;
}): { score: number; real: boolean } {
  if (typeof c.matchScore === "number") return { score: c.matchScore, real: true };
  const m = matchJob(`${c.name} ${c.industry || ""} ${c.positions || ""}`);
  return { score: m.score, real: false };
}
