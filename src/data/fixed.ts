import { BEHAVIORS } from './behaviors';
import type { EnemyDef, LootDef } from './catacombs';

/**
 * 困難な地下墓。間取り・敵・宝はすべてここに書いたとおりで、乱数を使わない。
 * 特定のシードでしか入れない（シードは手がかりで知るか、まれに迷い込む）。
 *
 * ※公開後にシードや中身を変えると、同じシードの体験が変わってしまう。
 *   直すときは新しい地下墓として足し、古いものは残す。
 */
export type FixedRoom =
  | { kind: 'battle' | 'boss'; enemy: EnemyDef; level: number; hpRatio?: number; souls: number; loot?: LootDef }
  | { kind: 'chest'; loot?: LootDef; souls?: number }
  | { kind: 'bonfire' };

export interface FixedCatacomb {
  name: string;
  /** 入るのに要るシード（小文字） */
  seed: string;
  rank: '困難';
  /** 目安のレベル（敵の強さはこのレベル基準で固定） */
  recommendedLevel: number;
  blurb: string;
  floors: FixedRoom[][];
}

const travel = { head: 'travel_hood', chest: 'travel_coat', arms: 'travel_gloves', legs: 'travel_boots' };
const sage = { head: 'sage_hood', chest: 'sage_robe', arms: 'travel_gloves', legs: 'sage_trousers' };
const knight = { head: 'knight_helm', chest: 'knight_armor', arms: 'knight_gauntlets', legs: 'knight_greaves' };
const iron = { head: 'iron_helm', chest: 'iron_armor', arms: 'iron_gauntlets', legs: 'iron_greaves' };

const item = (id: string, tier: 1 | 2 | 3 = 3): LootDef => ({ kind: 'item', id, tier });
const card = (id: string, tier: 1 | 2 | 3 = 3): LootDef => ({ kind: 'card', id, tier });

const E = {
  paladin: { name: '煤けた聖騎士', classId: 'vagabond', focus: { vit: 3, str: 4, end: 2, fai: 1 }, equip: { right: 'longsword', left: 'greatshield', ...iron }, elite: true, behavior: BEHAVIORS.paladin },
  cleric: { name: '大聖堂の司祭', classId: 'prophet', focus: { vit: 2, fai: 4, att: 2 }, equip: { right: 'longsword', left: 'prayer_seal', ...sage } },
  warden: { name: '大聖堂の門番', classId: 'hero', focus: { vit: 4, str: 3, dex: 2, end: 2 }, equip: { right: 'halberd', left: null, ...iron } },
  starfall: { name: '堕ちた星読み', classId: 'astrologer', focus: { vit: 3, int: 5, att: 2 }, equip: { right: 'dagger', left: 'star_staff', ...sage } },
  templar: { name: '大聖堂の騎士', classId: 'vagabond', focus: { vit: 3, str: 2, dex: 2, end: 2 }, equip: { right: 'longsword', left: 'heater', ...knight }, elite: true, behavior: BEHAVIORS.knight },
  archbishop: { name: '灰の大司教', classId: 'confessor', focus: { vit: 4, fai: 5, att: 2, end: 1 }, equip: { right: 'longsword', left: 'old_talisman', ...knight } },

  oathKnight: { name: '血盟騎士', classId: 'confessor', focus: { vit: 3, str: 2, arc: 4, end: 2 }, equip: { right: 'oath_cleaver', left: 'oath_seal', ...knight }, elite: true, behavior: BEHAVIORS.oathKnight },
  hunter: { name: '血に酔った狩人', classId: 'bandit', focus: { vit: 3, dex: 3, arc: 4 }, equip: { right: 'oath_saber', left: 'buckler', ...travel } },
  altarGuard: { name: '祭壇の番人', classId: 'hero', focus: { vit: 4, str: 3, arc: 3, end: 2 }, equip: { right: 'oath_cleaver', left: null, ...iron } },
  bloodPriest: { name: '血の司祭', classId: 'confessor', focus: { vit: 3, fai: 2, arc: 5, att: 2 }, equip: { right: 'oath_saber', left: 'oath_seal', ...sage } },
  bloodLord: { name: '血の君主', classId: 'confessor', focus: { vit: 5, str: 3, arc: 5, end: 3 }, equip: { right: 'oath_cleaver', left: 'oath_seal', ...iron } },
} satisfies Record<string, EnemyDef>;

export const FIXED_CATACOMBS: Record<string, FixedCatacomb> = {
  ashen_cathedral: {
    name: '灰の大聖堂',
    seed: 'ashen-cathedral',
    rank: '困難',
    recommendedLevel: 50,
    blurb: '灰に沈んだ大聖堂。聖騎士と司祭が今も祈りを守っている。',
    floors: [
      [
        { kind: 'battle', enemy: E.paladin, level: 48, hpRatio: 0.7, souls: 900 },
        { kind: 'battle', enemy: E.cleric, level: 46, hpRatio: 0.7, souls: 800 },
        { kind: 'chest', loot: item('old_talisman') },
        { kind: 'boss', enemy: E.warden, level: 52, hpRatio: 0.9, souls: 2500, loot: item('greatshield') },
        { kind: 'bonfire' },
      ],
      [
        { kind: 'battle', enemy: E.starfall, level: 50, hpRatio: 0.7, souls: 1000 },
        { kind: 'chest', loot: card('heavyarrow') },
        { kind: 'battle', enemy: E.templar, level: 52, hpRatio: 0.7, souls: 1000 },
        { kind: 'boss', enemy: E.archbishop, level: 58, hpRatio: 1, souls: 6000, loot: item('star_staff') },
      ],
    ],
  },
  blood_altar: {
    name: '血の祭壇',
    seed: 'blood-altar',
    rank: '困難',
    recommendedLevel: 60,
    blurb: '血盟騎士たちが守る奥の祭壇。血の君主が待つ。',
    floors: [
      [
        { kind: 'battle', enemy: E.hunter, level: 55, hpRatio: 0.7, souls: 1200 },
        { kind: 'battle', enemy: E.oathKnight, level: 56, hpRatio: 0.7, souls: 1300 },
        { kind: 'boss', enemy: E.altarGuard, level: 60, hpRatio: 0.9, souls: 3500, loot: item('oath_cleaver') },
        { kind: 'bonfire' },
      ],
      [
        { kind: 'battle', enemy: E.bloodPriest, level: 58, hpRatio: 0.7, souls: 1400 },
        { kind: 'chest', loot: card('bloodfeast') },
        { kind: 'battle', enemy: E.hunter, level: 60, hpRatio: 0.7, souls: 1500 },
        { kind: 'boss', enemy: { ...E.oathKnight, name: '祭壇の騎士長' }, level: 63, hpRatio: 0.9, souls: 4500, loot: card('bloodoath') },
        { kind: 'bonfire' },
      ],
      [
        { kind: 'battle', enemy: E.bloodPriest, level: 62, hpRatio: 0.7, souls: 1700 },
        { kind: 'chest', souls: 4000 },
        { kind: 'boss', enemy: E.bloodLord, level: 68, hpRatio: 1, souls: 12000, loot: item('oath_seal') },
      ],
    ],
  },
};

/** 困難な地下墓に関わる数値 */
export const FIXED = {
  /** 用意されたシードのまま入ったとき、困難な地下墓に迷い込む確率 */
  strayChance: 0.03,
  /** 通常の地下墓で、手がかり（困難な地下墓のシード）が見つかる確率 */
  clueChestChance: 0.04,
  clueBossChance: 0.1,
} as const;
