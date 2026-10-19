import type { EnemyDef, LootDef } from './catacombs';

/**
 * 底。困難な地下墓に入りそこねると落ちる、1階層3部屋の高難度の地下墓。
 * バジリスク2体（レベル+5）と、底ごとに違う盗掘者狩り（レベル+10）がいる。
 * 専用の物が3つずつ手に入るが、ソウルは少ない。クリアせずに脱出するとレベルを失う。
 */
export interface AbyssDef {
  name: string;
  blurb: string;
  hunter: EnemyDef;
  /** 専用の物（杖・底の魔術・捨てると発動する道具） */
  loot: LootDef[];
}

const none = { head: null, chest: null, arms: null, legs: null };
const travel = { head: 'travel_hood', chest: 'travel_coat', arms: 'travel_gloves', legs: 'travel_boots' };
const knight = { head: 'knight_helm', chest: 'knight_armor', arms: 'knight_gauntlets', legs: 'knight_greaves' };
const iron = { head: 'iron_helm', chest: 'iron_armor', arms: 'iron_gauntlets', legs: 'iron_greaves' };

export const BASILISK: EnemyDef = {
  name: 'バジリスク', classId: 'wretch', focus: { vit: 3, att: 2, end: 1, str: 1, arc: 1 },
  equip: { right: 'basilisk_maw', left: null, ...none },
};

export const ABYSSES: Record<string, AbyssDef> = {
  earth: {
    name: '地底',
    blurb: '地の底の坑道。重い得物の盗掘者狩りが待つ。',
    hunter: { name: '盗掘者狩り', classId: 'hero', focus: { vit: 4, str: 4, end: 2, dex: 1 }, equip: { right: 'greatsword', left: null, ...iron } },
    loot: [
      { kind: 'item', id: 'deep_staff', tier: 3 },
      { kind: 'card', id: 'quake', tier: 3 },
      { kind: 'card', id: 'fossil', tier: 3 },
    ],
  },
  hull: {
    name: '船底',
    blurb: '沈んだ船の底。刀を振るう盗掘者狩りが待つ。',
    hunter: { name: '盗掘者狩り', classId: 'samurai', focus: { vit: 4, dex: 4, end: 2 }, equip: { right: 'katana', left: 'buckler', ...travel } },
    loot: [
      { kind: 'item', id: 'hull_staff', tier: 3 },
      { kind: 'card', id: 'shipwreck', tier: 3 },
      { kind: 'card', id: 'barrel', tier: 3 },
    ],
  },
  gorge: {
    name: '谷底',
    blurb: '深い谷の底。血の刃の盗掘者狩りが待つ。',
    hunter: { name: '盗掘者狩り', classId: 'bandit', focus: { vit: 4, dex: 3, arc: 3, end: 1 }, equip: { right: 'oath_saber', left: 'buckler', ...travel } },
    loot: [
      { kind: 'item', id: 'gorge_staff', tier: 3 },
      { kind: 'card', id: 'gale', tier: 3 },
      { kind: 'card', id: 'feather', tier: 3 },
    ],
  },
  lake: {
    name: '湖底',
    blurb: '干上がった湖の底。祈祷を操る盗掘者狩りが待つ。',
    hunter: { name: '盗掘者狩り', classId: 'confessor', focus: { vit: 4, fai: 4, str: 1, att: 2 }, equip: { right: 'longsword', left: 'old_talisman', ...knight } },
    loot: [
      { kind: 'item', id: 'lake_staff', tier: 3 },
      { kind: 'card', id: 'tide', tier: 3 },
      { kind: 'card', id: 'droplet', tier: 3 },
    ],
  },
};

export const ABYSS = {
  /** 困難な地下墓のシードで入ったとき、入れる確率（入れなければ底に落ちる） */
  fixedEntryChance: 0.05,
  basiliskLevelBonus: 5,
  hunterLevelBonus: 10,
  basiliskHpRatio: 0.7,
  hunterHpRatio: 1,
  /** ソウルは少なめ */
  basiliskSouls: 40,
  hunterSouls: 300,
  /** バジリスクが専用の物を落とす確率（盗掘者狩りは必ず落とす） */
  basiliskDropChance: 0.25,
  /** 倒さずに脱出したときに失うレベル */
  escapeLevelLoss: 3,
} as const;
