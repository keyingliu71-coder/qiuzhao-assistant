export const STAGE_NAMES = [
  "待投递",
  "已投未回",
  "流程前期",
  "流程后期",
  "流程结束",
] as const;

// 各阶段建议的子状态（投递看板「岗位概览」用于统一口径，避免自由文本混乱）
export const SUB_STATE_OPTIONS: Record<number, string[]> = {
  1: ["已投未回", "已读未回"],
  2: ["测评/AI面试中", "笔试待完成", "笔试完成"],
  3: ["一面", "二面", "三面", "HR面"],
  4: ["已拿Offer", "已被拒"],
};