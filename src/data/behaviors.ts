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
} as const;
