import type { Equip } from '../character/model';
import type { StatKey } from '../engine/types';

/** 地下墓に出る敵の型 */
export interface EnemyDef {
  name: string;
  classId: string;
  focus: Partial<Record<StatKey, number>>;
  equip: Equip;
}

/** 手に入るもの。tier が高いほど出にくく、長い地下墓ほど出やすい */
export interface LootDef {
  kind: 'item' | 'card';
  id: string;
  tier: 1 | 2 | 3;
}

export interface CatacombDef {
  name: string;
  blurb: string;
  enemies: EnemyDef[];
  boss: EnemyDef;
  loot: LootDef[];
  /** 敵のレベルの補正（自分のレベルとの差）。書かなければ DUNGEON の値（自分より低い） */
  levelOffset?: { enemy: number; boss: number };
}

const travel = { head: 'travel_hood', chest: 'travel_coat', arms: 'travel_gloves', legs: 'travel_boots' };
const sage = { head: 'sage_hood', chest: 'sage_robe', arms: 'travel_gloves', legs: 'sage_trousers' };
const knight = { head: 'knight_helm', chest: 'knight_armor', arms: 'knight_gauntlets', legs: 'knight_greaves' };
const iron = { head: 'iron_helm', chest: 'iron_armor', arms: 'iron_gauntlets', legs: 'iron_greaves' };

/** 地下墓の最初の部屋にいる、弱い亡者（第2版のシードから） */
export const HOLLOW: EnemyDef = {
  name: '亡者', classId: 'wretch', focus: { vit: 1, str: 1 },
  equip: { right: 'hollow_blade', left: null, head: null, chest: null, arms: null, legs: null },
};

const item = (id: string, tier: 1 | 2 | 3): LootDef => ({ kind: 'item', id, tier });
const card = (id: string, tier: 1 | 2 | 3): LootDef => ({ kind: 'card', id, tier });

export const CATACOMBS: Record<string, CatacombDef> = {
  knight: {
    name: '煤けた騎士の地下墓',
    blurb: '直剣と盾の騎士たち。騎士の鎧や大盾が眠る。',
    enemies: [
      { name: '煤けた騎士', classId: 'vagabond', focus: { vit: 3, str: 2, dex: 2, end: 1 }, equip: { right: 'longsword', left: 'heater', ...knight } },
      { name: '煤けた従士', classId: 'hero', focus: { vit: 3, str: 3, end: 1 }, equip: { right: 'battleaxe', left: 'buckler', ...travel, chest: 'knight_armor' } },
    ],
    boss: { name: '煤けた騎士長', classId: 'vagabond', focus: { vit: 3, str: 4, dex: 1, end: 2 }, equip: { right: 'halberd', left: 'heater', ...knight } },
    loot: [
      card('kick', 1), card('stance', 1), card('flask', 1), item('knight_helm', 1), item('knight_gauntlets', 1), item('buckler', 1),
      item('longsword', 2), item('heater', 2), item('knight_armor', 2), item('knight_greaves', 2), card('oil', 2),
      item('greatshield', 3), item('halberd', 3), item('iron_armor', 3),
    ],
  },
  warrior: {
    name: '煤けた戦士の地下墓',
    blurb: '重い得物を振るう戦士たち。大剣と鉄の鎧が眠る。',
    enemies: [
      { name: '煤けた戦士', classId: 'hero', focus: { vit: 3, str: 3, end: 2 }, equip: { right: 'battleaxe', left: null, ...travel, chest: 'iron_armor' } },
      { name: '煤けた闘士', classId: 'warrior', focus: { vit: 3, dex: 3, end: 1 }, equip: { right: 'katana', left: null, ...travel } },
    ],
    boss: { name: '煤けた大戦士', classId: 'hero', focus: { vit: 4, str: 4, end: 3, dex: 1 }, equip: { right: 'greatsword', left: null, ...iron } },
    loot: [
      card('kick', 1), card('oil', 1), card('breath', 1), item('travel_coat', 1), item('iron_gauntlets', 1),
      item('battleaxe', 2), card('tackle', 2), item('iron_helm', 2), item('iron_greaves', 2),
      item('greatsword', 3), item('iron_armor', 3), card('tackle', 3),
    ],
  },
  samurai: {
    name: '煤けた刀使の地下墓',
    blurb: '速い刃の使い手たち。刀と軽い装束が眠る。',
    enemies: [
      { name: '煤けた刀使', classId: 'samurai', focus: { vit: 3, dex: 3, end: 2 }, equip: { right: 'katana', left: 'buckler', ...travel } },
      { name: '煤けた浪人', classId: 'warrior', focus: { vit: 2, dex: 3, end: 2 }, equip: { right: 'dagger', left: null, ...travel } },
    ],
    boss: { name: '煤けた剣聖', classId: 'samurai', focus: { vit: 3, dex: 4, end: 2 }, equip: { right: 'katana', left: null, ...knight } },
    loot: [
      card('knife', 1), card('kick', 1), card('insight', 1), item('travel_hood', 1), item('travel_boots', 1),
      item('dagger', 2), item('buckler', 2), card('breath', 2), item('travel_gloves', 2), card('knife', 2),
      item('katana', 3), card('insight', 3),
    ],
  },
  sorcerer: {
    name: '煤けた魔術師の地下墓',
    blurb: '灰の魔術を操る者たち。杖と魔術が眠る。',
    enemies: [
      { name: '煤けた魔術師', classId: 'astrologer', focus: { vit: 2, int: 3, att: 1 }, equip: { right: 'dagger', left: 'novice_staff', ...sage } },
      { name: '煤けた学徒', classId: 'prisoner', focus: { vit: 2, int: 2, dex: 1 }, equip: { right: 'longsword', left: 'novice_staff', ...travel } },
    ],
    boss: { name: '煤けた星読み', classId: 'astrologer', focus: { vit: 3, int: 5, att: 2 }, equip: { right: 'dagger', left: 'star_staff', ...sage } },
    loot: [
      card('arrow', 1), card('insight', 1), item('sage_hood', 1), item('sage_trousers', 1),
      item('novice_staff', 2), item('sage_robe', 2), card('arrow', 2),
      item('star_staff', 3), card('heavyarrow', 3),
    ],
  },
  cleric: {
    name: '煤けた聖職者の地下墓',
    blurb: '祈りを捧げる者たち。聖印と祈祷が眠る。',
    enemies: [
      { name: '煤けた聖職者', classId: 'prophet', focus: { vit: 2, fai: 3, att: 1 }, equip: { right: 'longsword', left: 'prayer_seal', ...sage } },
      { name: '煤けた巡礼', classId: 'confessor', focus: { vit: 3, fai: 2, str: 1 }, equip: { right: 'longsword', left: 'prayer_seal', ...travel } },
    ],
    boss: { name: '煤けた司教', classId: 'confessor', focus: { vit: 3, fai: 4, att: 2 }, equip: { right: 'longsword', left: 'old_talisman', ...knight } },
    loot: [
      card('flask', 1), card('mend', 1), item('sage_hood', 1),
      item('prayer_seal', 2), card('spear', 2), card('blessing', 2), item('sage_robe', 2), card('mend', 2),
      item('old_talisman', 3), card('spear', 3),
    ],
  },
  blood: {
    name: '血盟騎士の地下墓',
    blurb: '血の誓いを立てた騎士たち。血の武器と血炎の祈祷が眠る。',
    // 煤けた地下墓より奥。敵は自分より強い
    levelOffset: { enemy: 2, boss: 5 },
    enemies: [
      { name: '血盟の従士', classId: 'bandit', focus: { vit: 3, dex: 2, arc: 3 }, equip: { right: 'oath_saber', left: 'buckler', ...travel } },
      { name: '血盟騎士', classId: 'confessor', focus: { vit: 3, str: 2, arc: 3, end: 1 }, equip: { right: 'oath_cleaver', left: 'oath_seal', ...knight } },
    ],
    boss: { name: '血盟騎士団長', classId: 'confessor', focus: { vit: 4, str: 2, arc: 4, end: 2 }, equip: { right: 'oath_cleaver', left: 'oath_seal', ...knight } },
    loot: [
      card('bloodblade', 1), card('flask', 1), card('knife', 1),
      item('oath_saber', 2), card('bloodclaw', 2), card('bloodoath', 2),
      item('oath_cleaver', 3), item('oath_seal', 3), card('bloodfeast', 3),
    ],
  },
};

/** シードから地下墓を選ぶときの並び。新しい地下墓は末尾に足す
 *  （数が変わると、同じシードで行ける地下墓も変わる） */
export const CATACOMB_ORDER = ['knight', 'warrior', 'samurai', 'sorcerer', 'cleric', 'blood'];

/** 地下墓の数値 */
export const DUNGEON = {
  floorsMin: 1,
  floorsMax: 3,
  roomsMin: 3,
  roomsMax: 5,
  /** 途中の部屋の内訳（重み） */
  roomWeights: { battle: 6, chest: 3, bonfire: 1 },
  /** 敵のレベル = 自分のレベル + offset + 階層×floorStep + 部屋の順番×roomStep */
  enemyLevelOffset: -8,
  enemyFloorStep: 3,
  enemyRoomStep: 1,
  /** 主のレベル = 自分のレベル + bossLevelOffset + 階層×floorStep */
  bossLevelOffset: -2,
  /** 最初の部屋の亡者のレベル = 自分のレベル + hollowLevelOffset（第2版のシードから） */
  hollowLevelOffset: -10,
  /** 困難な地下墓は書いたレベルが基本だが、自分のほうが高ければ「自分のレベル＋この値」になる */
  fixedAboveEnemy: 2,
  fixedAboveBoss: 5,
  /** 敵の最大HPの倍率（部屋をまたいでHPを持ち越すので、道中の敵は控えめ） */
  enemyHpRatio: 0.5,
  bossHpRatio: 1,
  /** 途中の階層の主（そのあとに篝火があるので、地下墓の主より控えめ） */
  floorBossHpRatio: 0.75,
  /** ソウル = base + 敵のレベル × perLevel（主は ×bossMult） */
  soulsBase: 40,
  soulsPerLevel: 10,
  bossMult: 3,
  /** 途中の階層の主のソウル倍率 */
  floorBossMult: 2,
  /** 戦闘部屋で敵が物を落とす確率 */
  dropChance: 0.35,
  /** 宝箱がソウルだった場合の量 = 自分のレベル × chestSoulsPerLevel */
  chestSoulsChance: 0.25,
  chestSoulsPerLevel: 15,
  /** 踏破したときの追加ソウル（部屋数 × clearBonusPerRoom） */
  clearBonusPerRoom: 30,
  /** すでに持っている装備はソウルに替わる（tier × dupeSouls） */
  dupeSouls: 150,
} as const;
