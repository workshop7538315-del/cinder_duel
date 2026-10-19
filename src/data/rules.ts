/** 数値調整はここに集約する */

/** 能力値 → 派生値の曲線。[能力値, 値] の点を直線でつなぐ（エルデンリング風のソフトキャップ） */
export type Curve = readonly (readonly [number, number])[];

export const CURVES = {
  hp: [[1, 32], [40, 110], [60, 130], [99, 150]],
  fp: [[1, 1], [40, 40], [60, 50], [99, 60]],
  stInit: [[1, 2], [40, 6], [99, 8]],
  stMax: [[1, 4], [40, 10], [99, 14]],
  equipLoad: [[1, 30], [40, 90], [99, 130]],
} as const satisfies Record<string, Curve>;

export const RULES = {
  // キャラクリ
  levelBudget: 0, //  作成時に上げられるレベル（素性のレベルから始まり、あとはソウルで上げる）
  legacyFreeLevels: 30, //  v0.15 までに作ったキャラが作成時にもらっていたレベル（そのキャラはそのまま持ち続ける）
  /** レベルアップに要るソウル = エルデンリングの式 × この倍率（最低 levelCostMin） */
  levelCostScale: 0.5,
  levelCostMin: 100,
  statMax: 99,
  levelBand: 15, //    対戦相手のレベル差の上限
  deckMin: 12,
  deckMax: 20,
  copyLimit: 3, //     同名カードの上限

  // 装備
  /** 重量率（装備重量 ÷ 装備可能重量）の上限ごとの区分 */
  loadLight: 0.3,
  loadMedium: 0.7,
  loadHeavy: 1.0,
  /** 装備条件を満たさないとき: 基礎値にこの倍率、能力補正なし。盾のカット率にも掛かる */
  reqPenalty: 0.6,

  // ラウンド
  staminaRecovery: 3, // ラウンド開始時の回復量（ステータス非依存）
  drawCost: 1, // ドローに払うスタミナダイス
  handStart: 4,

  // ガード消費 = guardBase + 受けるはずのダメージ ÷ guardPer
  guardBase: 1,
  guardPer: 6,

  // 出血: 溜まった値が上限に達すると「最大HP×割合＋固定値」のダメージを受けて0に戻る
  bleedThreshold: 12,
  bleedBurstRatio: 0.15,
  bleedBurstBase: 6,
  bleedDecay: 3, //    ラウンド開始時に減る量
  bleedGuardRatio: 0.5, // ガードしたときに溜まる割合（回避なら溜まらない）

  // 呪死: 溜まりきると即死。回避すれば溜まらず、ガードで半分
  curseThreshold: 12,
  curseDecay: 2,
  curseGuardRatio: 0.5,

  // カード効果
  flaskRatio: 0.3,
  oilBonus: 4,
  blessingBonus: 6,
  bloodOathBleed: 5,
  kickBreak: 3,
  stanceGuardDiscount: 2,
  stanceCutBonus: 0.2,
} as const;
