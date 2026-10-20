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
  accessorySlots: 4, //  アクセサリ（指輪・タリスマン）を身につけられる数
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

  // 体幹。尽きると「よろめき」: 次の自分の手番は動けず、それまでリアクションもできず、受けるダメージが増える
  // 体幹の上限 = poiseBase + 持久 × poisePerEnd + レベル × poisePerLevel（強敵・主は別の式）
  poiseBase: 8,
  poisePerEnd: 0.3,
  poisePerLevel: 0.1,
  /** 強敵・主の体幹の上限 = base + レベル × perLevel */
  elitePoise: { base: 20, perLevel: 0.3 },
  bossPoise: { base: 40, perLevel: 0.7 },
  /** ガードで受けたとき、受けるはずだったダメージ × この割合だけ体幹が減る（プレイヤーと通常の敵はガードでだけ減る） */
  poiseGuardRate: 0.35,
  /** 強敵・主は、攻撃を受けても体幹が減る（ダメージ × この割合） */
  poiseHitRate: 0.4,
  /** 溜めているあいだの強敵・主は、体幹がこの倍率で減りやすい */
  poiseChargeMult: 1.5,
  /** ラウンドの初めに戻る体幹（上限に対する割合） */
  poiseRegen: 0.25,
  /** よろめいている相手に与えるダメージの倍率 */
  staggerDamageMult: 1.5,
  // 回避のコスト = 重さの区分の値 + 追加。追加は、受けるはずのダメージが「幅」を1つ超えるごとに+1（最大 dodgeExtraMax）。
  // 幅 = dodgeBandBase + 自分のレベル × dodgeBandPerLevel（レベルが上がるとダメージも上がるので、幅も広がる）
  dodgeBandBase: 14,
  dodgeBandPerLevel: 0.15,
  dodgeExtraMax: 3,
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
