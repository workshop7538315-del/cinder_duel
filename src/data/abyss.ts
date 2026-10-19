import type { EnemyDef, LootDef } from './catacombs';

/**
 * 底。困難な地下墓に入りそこねると落ちる、1階層3部屋の高難度の地下墓。
 * バジリスク2体（レベル+5）と、底ごとに違う盗掘者狩り（レベル+10）がいる。
 * 専用の物が3つずつ手に入るが、ソウルは少ない。クリアせずに脱出するとレベルを失う。
 */
export interface AbyssDef {
  name: string;
  /** 踏破したあと、このシードで直接入れる（小文字） */
  seed: string;
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
    seed: 'earth-abyss',
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
    seed: 'hull-abyss',
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
    seed: 'gorge-abyss',
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
    seed: 'lake-abyss',
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

/**
 * 海底。底に落ちるときに、さらにまれに落ちる。間取り・敵・宝はここに書いたとおりで乱数を使わない
 * （敵のレベルだけは、入ったときの自分のレベル＋bonus）。
 * ※公開後は中身を変えない。直すなら新しく足す。
 */
export type SeaRoom =
  | { kind: 'battle' | 'boss'; enemy: EnemyDef; bonus: number; hpRatio: number; souls: number; loot?: LootDef }
  | { kind: 'chest'; loot?: LootDef; souls?: number }
  | { kind: 'bonfire' };

export interface SeaDef {
  name: string;
  seed: string;
  blurb: string;
  /** 専用の物（触媒の銛・海底の魔術・捨てると発動する道具） */
  loot: LootDef[];
  floors: SeaRoom[][];
}

const SEA_FOE = {
  fishman: { name: '深海の魚人', classId: 'bandit', focus: { vit: 3, dex: 4, arc: 2, end: 1 }, equip: { right: 'fishman_claw', left: null, ...none } },
  crab: { name: '海底の大蟹', classId: 'hero', focus: { vit: 5, str: 4, end: 2 }, equip: { right: 'crab_pincer', left: null, ...none } },
  drowned: { name: '溺れ人の亡霊', classId: 'astrologer', focus: { vit: 3, int: 4, att: 3 }, equip: { right: 'drowned_grasp', left: null, ...none } },
  serpent: { name: '海淵の大蛇', classId: 'wretch', focus: { vit: 5, str: 3, arc: 4, att: 2, end: 2 }, equip: { right: 'serpent_fang', left: null, ...none } },
} satisfies Record<string, EnemyDef>;

const seaLoot = {
  harpoon: { kind: 'item', id: 'sea_harpoon', tier: 3 },
  roar: { kind: 'card', id: 'searoar', tier: 3 },
  pearl: { kind: 'card', id: 'pearl', tier: 3 },
} satisfies Record<string, LootDef>;

export const SEAFLOOR: SeaDef = {
  name: '海底',
  seed: 'sea-abyss',
  blurb: '底のさらに下、光の届かない海の底。溺れ人と海淵の大蛇が棲む。',
  loot: [seaLoot.harpoon, seaLoot.roar, seaLoot.pearl],
  floors: [
    [
      { kind: 'battle', enemy: SEA_FOE.fishman, bonus: 5, hpRatio: 0.7, souls: 60 },
      { kind: 'battle', enemy: SEA_FOE.crab, bonus: 7, hpRatio: 0.7, souls: 80 },
      { kind: 'chest', souls: 200 },
      { kind: 'boss', enemy: { ...SEA_FOE.drowned, name: '溺れ人の亡霊（海底一層の主）' }, bonus: 10, hpRatio: 0.8, souls: 300, loot: seaLoot.pearl },
      { kind: 'bonfire' },
    ],
    [
      { kind: 'battle', enemy: SEA_FOE.drowned, bonus: 8, hpRatio: 0.7, souls: 80 },
      { kind: 'battle', enemy: SEA_FOE.fishman, bonus: 8, hpRatio: 0.7, souls: 80 },
      { kind: 'chest', loot: seaLoot.roar },
      { kind: 'boss', enemy: SEA_FOE.serpent, bonus: 12, hpRatio: 1, souls: 800, loot: seaLoot.harpoon },
    ],
  ],
};

/** 海底のキー（catacombId は "abyss:sea"） */
export const SEA_KEY = 'sea';
/** 底のキー（海底も含む） */
export const ABYSS_KEYS: string[] = [...Object.keys(ABYSSES), SEA_KEY];

export const ABYSS = {
  /** 底に落ちるとき、海底に落ちる確率 */
  seaChance: 0.1,
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
