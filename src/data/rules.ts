/** 数値調整はここに集約する */
export const RULES = {
  // 派生値
  hpBase: 30,
  hpPerVit: 2,
  fpPerMind: 1,
  stInitBase: 1,
  stInitPerEnd: 5, // 初期スタミナ = 1 + 持久÷5
  stMaxPerEnd: 2, //  スタミナ上限 = 持久÷2

  // ラウンド
  staminaRecovery: 3, // ラウンド開始時の回復量（ステータス非依存）
  drawCost: 1, // ドローに払うスタミナダイス
  handStart: 4,

  // ガード消費 = guardBase + 受けるはずのダメージ ÷ guardPer
  guardBase: 1,
  guardPer: 6,

  // カード効果
  oilBonus: 4,
  kickBreak: 3,
  stanceGuardDiscount: 2,
  stanceCutBonus: 0.2,
} as const;
