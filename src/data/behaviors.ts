import type { Behavior } from '../engine/types';

/**
 * 強敵・主の動き方。強敵と主は、スタミナダイスも手札も使わず、ここに書いた順番（cycle）か
 * 重みつきのランダム（random）で、1手番に1つの行動をする。次の行動は予告される。
 * 回避・ガードは dodge / guard の確率で、敵ごとに決まる。
 * 動き方を書いていない強敵・主は、武器と装備から autoBehavior で作る（AUTO_BEHAVIOR の値）。
 */
export const BEHAVIORS = {
  /** 盾を構えて受け、隙を見て突く騎士 */
  knight: {
    mode: 'cycle', dodge: 0, guard: 0.45,
    moves: [
      { name: '二連斬り', use: 'weapon', hits: 2 },
      { name: '盾を構える', guard: true },
      { name: '踏み込み突き', use: 'weapon', mult: 1.7 },
    ],
  },
  /** 大盾で固める聖騎士 */
  paladin: {
    mode: 'cycle', dodge: 0, guard: 0.6,
    moves: [
      { name: '斬り下ろし', use: 'weapon', mult: 1.2 },
      { name: '大盾を構える', guard: true },
      { name: '連撃', use: 'weapon', hits: 2 },
      { name: '祈り', heal: 0.12 },
    ],
  },
  /** 血の刃を振るう血盟騎士。読みにくい */
  oathKnight: {
    mode: 'random', dodge: 0.15, guard: 0.2,
    moves: [
      { name: '薙ぎ払い', use: 'weapon', mult: 1.3, weight: 3 },
      { name: '二連撃', use: 'weapon', hits: 2, weight: 2 },
      { name: '血の戦技', use: 'art', weight: 2 },
      { name: '血を啜る', heal: 0.1, weight: 1 },
    ],
  },
  /** 硬い殻で受け、重い鋏で挟む大蟹 */
  crab: {
    mode: 'cycle', dodge: 0, guard: 0.35,
    moves: [
      { name: '鋏で叩く', use: 'weapon', mult: 1.1 },
      { name: '鋏で叩く', use: 'weapon', mult: 1.1 },
      { name: '泡を吹く' },
      { name: '挟み潰し', use: 'art' },
    ],
  },

  // ---- 主（手で書いた動き方。HPが半分を切ると第二形態） ----
  /** 煤けた騎士長（斧槍と盾） */
  knightCaptain: {
    mode: 'cycle', dodge: 0, guard: 0.35,
    moves: [
      { name: '薙ぎ払い', use: 'weapon', mult: 1.2 },
      { name: '二連突き', use: 'weapon', hits: 2 },
      { name: '盾を構える', guard: true },
      { name: '斬り上げ', use: 'art' },
    ],
    phase2: {
      at: 0.5, mode: 'cycle', text: '煤けた騎士長は兜を投げ捨てた。斧槍に火の粉が散る……！',
      moves: [
        { name: '踏み込み二連', use: 'weapon', hits: 2, mult: 1.1 },
        { name: '大薙ぎ', use: 'weapon', mult: 2.6, charge: true, dodgeExtra: 1, poiseMult: 2 },
        { name: '薙ぎ払い', use: 'weapon', mult: 1.3 },
        { name: '盾を構える', guard: true },
      ],
    },
  },
  /** 血の君主 */
  bloodLord: {
    mode: 'random', dodge: 0.1, guard: 0.2,
    moves: [
      { name: '血の薙ぎ', use: 'weapon', mult: 1.3, weight: 3 },
      { name: '二連撃', use: 'weapon', hits: 2, weight: 2 },
      { name: '血の戦技', use: 'art', weight: 2 },
      { name: '血を啜る', heal: 0.1, weight: 1 },
    ],
    phase2: {
      at: 0.5, mode: 'random', text: '血の君主は自らの血を浴びた。血が渦を巻く……！',
      moves: [
        { name: '三連撃', use: 'weapon', hits: 3, weight: 3 },
        { name: '血の嵐', use: 'art', mult: 2, charge: true, unguardable: true, weight: 2 },
        { name: '血の戦技', use: 'art', mult: 1.2, weight: 2 },
      ],
    },
  },
  /** 海淵の大蛇・深海の大蛇 */
  serpent: {
    mode: 'cycle', dodge: 0, guard: 0,
    moves: [
      { name: '噛みつき', use: 'weapon', hits: 2 },
      { name: '締め付け', use: 'weapon', mult: 1.4, poiseMult: 1.5 },
      { name: '大渦', use: 'art' },
    ],
    phase2: {
      at: 0.5, mode: 'random', text: '大蛇が身をよじり、水底が唸りを上げる……！',
      moves: [
        { name: '三連噛み', use: 'weapon', hits: 3, weight: 3 },
        { name: '大渦', use: 'art', weight: 2 },
        { name: '津波', use: 'weapon', mult: 2.5, charge: true, unguardable: true, dodgeExtra: 2, weight: 2 },
      ],
    },
  },
} satisfies Record<string, Behavior>;

/** 動き方を書いていない強敵・主の作り方 */
export const AUTO_BEHAVIOR = {
  /** 盾を持っていればガードしやすい */
  guardWithShield: 0.35,
  guardWithout: 0.1,
  /** 強敵・主がガードしたときのカット率の上限（盾で100%受けきられないように） */
  guardCutCap: 0.7,
  /** デッキの攻撃カード（魔術・祈祷など）を行動に入れる数と重み */
  cardMoves: 2,
  cardWeight: 3,
  /** 重さの区分ごとの回避のしやすさ */
  dodge: { light: 0.3, medium: 0.2, heavy: 0.1, over: 0 },
  /** 強打の倍率 */
  heavyMult: 1.5,
  /** 主の第二形態（書いていない主）: HPがこの割合以下で入り、攻撃の倍率が上がり、溜めの大技が加わる */
  phase2At: 0.5,
  phase2Mult: 1.15,
  /** 溜めの大技 */
  chargeMult: 2.4,
  chargeDodgeExtra: 1,
  chargeWeight: 2,
} as const;
