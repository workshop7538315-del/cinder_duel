import { autoAlloc, autoDeck, inventoryOf, loadout, type Character } from '../character/model';
import { CATACOMB_ORDER, CATACOMBS, DUNGEON, HOLLOW, type CatacombDef, type EnemyDef, type LootDef } from '../data/catacombs';
import { ABYSS, ABYSS_KEYS, ABYSSES, BASILISK, DEEP, DEEP_KEY, SEA_KEY, SEAFLOOR } from '../data/abyss';
import { FIXED, FIXED_CATACOMBS } from '../data/fixed';
import { CATACOMB_ACCESSORIES } from '../data/accessories';
import { CRYSTAL, CRYSTAL_KEYS, rollCrystal, rollCursedCrystal } from '../data/crystals';
import type { CrystalKey } from '../engine/types';
import { pick, pickWeighted, randInt, seededRng, type SeededRng } from './rng';

export type RoomKind = 'battle' | 'chest' | 'bonfire' | 'boss';

export interface Room {
  kind: RoomKind;
  /** 戦闘・主の部屋の敵 */
  enemy?: Character;
  /** 敵の最大HPの倍率 */
  hpRatio?: number;
  /** 倒したとき・宝箱で得るソウル */
  souls: number;
  /** 倒したとき・宝箱で得るもの */
  loot: LootDef | null;
  /** 手がかり（困難な地下墓のID）。見つけた時点で覚える */
  clue?: string;
  /** 2周目以降の追加の落とし物（アクセサリ） */
  extra?: LootDef | null;
}

export interface Dungeon {
  /** 通常の地下墓は CATACOMBS のキー、困難な地下墓は "fixed:キー" */
  catacombId: string;
  name: string;
  /** 困難な地下墓なら '困難'、底なら '底' */
  rank: '通常' | '困難' | '底';
  seed: string;
  /** 生成したときの自分のレベル（敵の強さの基準） */
  level: number;
  floors: Room[][];
  totalRooms: number;
  /** 0〜1。部屋が多いほど高く、良いものが出やすい */
  quality: number;
  /** 周回（1周目なら 1。2周目以降は敵が強く、アクセサリが出る） */
  cycle?: number;
  /** 深海: 潜るたびに変わる値（淵結晶の強さ・マイナスを決める） */
  salt?: string;
}

export const ROOM_NAMES: Record<RoomKind, string> = { battle: '敵', chest: '宝箱', bonfire: '篝火', boss: '主' };

function buildEnemy(def: EnemyDef, level: number, tag: string): Character {
  const c: Character = {
    id: `enemy:${tag}`, name: def.name, classId: def.classId,
    alloc: autoAlloc(def.classId, level, def.focus), equip: { ...def.equip }, npc: true,
    deck: [], inventory: { items: [], cards: {} }, souls: 0, createdAt: 0, updatedAt: 0,
  };
  const lo = loadout(c);
  c.deck = autoDeck(lo.stats, lo.schools, lo.right);
  c.inventory = inventoryOf(c.equip, c.deck);
  return c;
}

/** 長さと深さで tier を決め、その tier の中から1つ選ぶ */
function rollLoot(r: SeededRng, cat: CatacombDef, quality: number, floor: number, minTier = 1): LootDef | null {
  const score = r() * 0.7 + quality * 0.45 + floor * 0.1;
  let tier = Math.max(minTier, score > 0.9 ? 3 : score > 0.55 ? 2 : 1);
  for (; tier >= 1; tier--) {
    const pool = cat.loot.filter((l) => l.tier === tier);
    if (pool.length) return pick(r, pool);
  }
  return null;
}

const enemySouls = (level: number) => DUNGEON.soulsBase + level * DUNGEON.soulsPerLevel;

/** シードの表記ゆれをなくす（前後の空白を除き、小文字にする） */
export const normalizeSeed = (seed: string): string => seed.trim().toLowerCase().slice(0, 24);

/* ---------------- シードの版（シーズン） ----------------
 * シードの頭の「数字-」が生成の版。例: 1-k3d9xq2m
 * 生成のしかた（間取りの決め方・乱数の使い方・宝の表）を変えるときは、
 * 今の版を残したまま新しい版を足し、新しいシードだけ新しい版で作る。
 * こうすると、古いシードはずっと同じ地下墓のまま遊べる。
 * 数字のないシード（v0.7〜0.9で作ったもの）は第1版として扱う。
 */
export const CURRENT_SEED_VERSION = 2;

type Generator = (seed: string, level: number) => Dungeon;

const GENERATORS: Record<number, Generator> = {
  1: (seed, level) => buildCatacomb(catacombFromSeedV1(seed), seed, level),
  // 第2版: 第1版と同じ地下墓・間取り・宝で、最初の部屋の敵だけ弱い亡者になる
  2: (seed, level) => withHollow(buildCatacomb(catacombFromSeedV1(seed), seed, level)),
};

/** 最初の部屋の敵を、弱い亡者に替える（落とし物はそのまま） */
function withHollow(d: Dungeon): Dungeon {
  const first = d.floors[0][0];
  if (first.kind !== 'battle') return d;
  const lv = Math.max(1, d.level + DUNGEON.hollowLevelOffset);
  d.floors[0][0] = {
    ...first, enemy: buildEnemy(HOLLOW, lv, `${d.catacombId}:${d.seed}:0:0`), hpRatio: DUNGEON.enemyHpRatio, souls: enemySouls(lv),
  };
  return d;
}

export function seedVersion(seed: string): number {
  const m = /^(\d+)-/.exec(normalizeSeed(seed));
  return m ? Number(m[1]) : 1;
}

/** 困難な地下墓のシードなら、そのキー */
export function fixedFromSeed(seed: string): string | null {
  const s = normalizeSeed(seed);
  return Object.entries(FIXED_CATACOMBS).find(([, f]) => f.seed === s)?.[0] ?? null;
}

/** 第1版: シードでどの地下墓かが決まる */
function catacombFromSeedV1(seed: string): string {
  return pick(seededRng(`catacomb:${normalizeSeed(seed)}`), CATACOMB_ORDER);
}
/** 今の版で、そのシードがどの地下墓になるか */
export const catacombFromSeed = (seed: string): string =>
  fixedFromSeed(seed) ? `fixed:${fixedFromSeed(seed)}` : catacombFromSeedV1(seed);

/** シードから地下墓を作る。同じシード・レベルなら必ず同じ地下墓・同じ中身になる */
export function generateDungeon(seed: string, level: number, cycle = 1): Dungeon {
  const s = normalizeSeed(seed);
  const fixed = fixedFromSeed(s);
  if (fixed) return buildFixed(fixed, level);
  const gen = GENERATORS[seedVersion(s)];
  if (!gen) throw new Error('このシードは新しいバージョンのものです。ページを再読み込みしてください。');
  return withCycle(gen, s, level, cycle);
}

/**
 * 周回。2周目以降は、同じ間取り・敵・宝のまま敵のレベルを上げ（1周ごとに cycleLevelStep）、
 * 主・宝箱がアクセサリを追加で落とすようになる（別の乱数で決めるので、1周目の中身は変わらない）。
 * Dungeon.level は入ったときの自分のレベルのまま（作り直すときに使う）
 */
function withCycle(gen: Generator, seed: string, level: number, cycle: number): Dungeon {
  const c = Math.max(1, Math.floor(cycle));
  if (c === 1) return gen(seed, level);
  const d = gen(seed, level + (c - 1) * DUNGEON.cycleLevelStep);
  const pool = CATACOMB_ACCESSORIES[d.catacombId] ?? [];
  d.floors.forEach((rooms, fi) => rooms.forEach((room, ri) => {
    const last = fi === d.floors.length - 1;
    const chance = room.kind === 'boss' ? (last ? DUNGEON.cycleBossAccessory : DUNGEON.cycleFloorBossAccessory)
      : room.kind === 'chest' ? DUNGEON.cycleChestAccessory : 0;
    if (!chance || !pool.length) return;
    const r = seededRng(`cycle:${d.catacombId}:${seed}:${c}:${fi}:${ri}`);
    if (r() < chance) room.extra = { kind: 'item', id: pick(r, pool), tier: 3 };
  }));
  return { ...d, level, cycle: c };
}

/** 探索を再開するとき（入ったときの地下墓をそのまま作り直す） */
export function rebuildDungeon(catacombId: string, seed: string, level: number, cycle = 1, salt = ''): Dungeon {
  if (catacombId === `abyss:${DEEP_KEY}`) return buildDeep(seed, level, salt);
  if (catacombId.startsWith('fixed:')) return buildFixed(catacombId.slice(6), level);
  if (catacombId.startsWith('abyss:')) return buildAbyss(catacombId.slice(6), seed, level);
  const gen = GENERATORS[seedVersion(seed)] ?? GENERATORS[1];
  const d = withCycle(gen, seed, level, cycle);
  return d.catacombId === catacombId ? d : withCycle((s, l) => buildCatacomb(catacombId, s, l), seed, level, cycle);
}

/** 用意されたシードのまま入ったとき、困難な地下墓に迷い込むか（迷い込むならそのシード） */
export function strayInto(rand: () => number = Math.random): string | null {
  if (rand() >= FIXED.strayChance) return null;
  const list = Object.values(FIXED_CATACOMBS);
  return list[Math.floor(rand() * list.length)].seed;
}

/** 新しく作るシード（今の版の印つき） */
export const versionedSeed = (body: string): string => `${CURRENT_SEED_VERSION}-${body}`;

/* ---------------- 底 ---------------- */

/** 底を作る。バジリスク2体（レベル+5）と盗掘者狩り（レベル+10）の1階層3部屋 */
export function buildAbyss(key: string, seed: string, level: number): Dungeon {
  if (key === SEA_KEY) return buildSea(seed, level);
  const a = ABYSSES[key];
  const r = seededRng(`abyss:${key}:${seed}`);
  const base = abyssBaseLevel(level);
  const bl = base + ABYSS.basiliskLevelBonus;
  const hl = base + ABYSS.hunterLevelBonus;
  const basilisk = (ri: number): Room => ({
    kind: 'battle', enemy: buildEnemy(BASILISK, bl, `abyss:${key}:${seed}:${ri}`), hpRatio: ABYSS.basiliskHpRatio,
    souls: ABYSS.basiliskSouls, loot: r() < ABYSS.basiliskDropChance ? pick(r, a.loot) : null,
    extra: crystalDrop(`abyss:${key}:${seed}:${ri}`, key, CRYSTAL.basiliskDrop),
  });
  const floors: Room[][] = [[
    basilisk(0),
    basilisk(1),
    {
      kind: 'boss', enemy: buildEnemy({ ...a.hunter, name: `${a.hunter.name}（${a.name}）` }, hl, `abyss:${key}:${seed}:2`),
      hpRatio: ABYSS.hunterHpRatio, souls: ABYSS.hunterSouls, loot: pick(r, a.loot),
      extra: crystalDrop(`abyss:${key}:${seed}:2`, key, 1),
    },
  ]];
  return { catacombId: `abyss:${key}`, name: a.name, rank: '底', seed, level, floors, totalRooms: 3, quality: 0 };
}

export { ABYSS_KEYS, SEA_KEY };

/** 底の名前（海底も含む） */
export const abyssName = (key: string): string | null =>
  key === SEA_KEY ? SEAFLOOR.name : key === DEEP_KEY ? DEEP.name : ABYSSES[key]?.name ?? null;
/** 底の直通のシード */
export const abyssSeed = (key: string): string | null => (key === SEA_KEY ? SEAFLOOR.seed : ABYSSES[key]?.seed ?? null);

/** 底の直通のシードなら、その底のキー */
export function abyssFromSeed(seed: string): string | null {
  const s = normalizeSeed(seed);
  return ABYSS_KEYS.find((k) => abyssSeed(k) === s) ?? null;
}

/** 底の敵のレベルの基準（自分のレベルと Lv80 の高いほう） */
export const abyssBaseLevel = (level: number): number => Math.max(level, ABYSS.minBaseLevel);

/** どの底に落ちるか（まれに海底） */
export const pickAbyss = (rand: () => number = Math.random): string => {
  if (rand() < ABYSS.seaChance) return SEA_KEY;
  const keys = Object.keys(ABYSSES);
  return keys[Math.floor(rand() * keys.length)];
};

/* ---------------- 深海 ---------------- */

/** 深海の呪われた淵結晶が強めるもの（シードで決まる） */
export const deepTarget = (seed: string): CrystalKey => pick(seededRng(`deep-target:${normalizeSeed(seed)}`), CRYSTAL_KEYS);

/**
 * 深海を作る。間取り・敵はシードで決まり、淵結晶の強さとマイナスは salt（潜るたびに変わる）で決まる
 */
export function buildDeep(seed: string, level: number, salt: string): Dungeon {
  const s = normalizeSeed(seed);
  const r = seededRng(`deep:${s}`);
  const target = deepTarget(s);
  const base = abyssBaseLevel(level);
  const floorCount = randInt(r, DEEP.floorsMin, DEEP.floorsMax);
  const crystal = (fi: number, ri: number, chance: number): LootDef | null => {
    const cr = seededRng(`deep-crystal:${s}:${salt}:${fi}:${ri}`);
    return cr() < chance ? { kind: 'crystal', id: 'crystal', tier: 3, crystal: rollCursedCrystal(cr, target) } : null;
  };
  const floors: Room[][] = [];
  for (let fi = 0; fi < floorCount; fi++) {
    const last = fi === floorCount - 1;
    const n = randInt(r, DEEP.roomsMin, DEEP.roomsMax);
    const bossAt = last ? n - 1 : n - 2;
    const rooms: Room[] = [];
    for (let ri = 0; ri < n; ri++) {
      let kind: RoomKind = ri === bossAt ? 'boss' : ri > bossAt ? 'bonfire' : ri === 0 ? 'battle' : pickWeighted(r, DEEP.roomWeights);
      if (kind === 'bonfire' && rooms[ri - 1]?.kind === 'bonfire') kind = 'battle';
      const tag = `deep:${s}:${fi}:${ri}`;
      if (kind === 'boss') {
        const fb = pick(r, DEEP.floorBosses);
        const def = last ? DEEP.boss : { ...fb, name: `${fb.name}（深海${fi + 1}層の主）` };
        const lv = base + (last ? DEEP.bossBonus : DEEP.floorBossBonus) + fi * DEEP.floorStep;
        const fal = last && r() < DEEP.falchionChance;
        rooms.push({
          kind, enemy: buildEnemy(def, lv, tag), hpRatio: last ? DEEP.bossHpRatio : DEEP.floorBossHpRatio,
          souls: last ? DEEP.bossSouls : DEEP.floorBossSouls,
          loot: fal ? { kind: 'item', id: 'sea_falchion', tier: 3 } : null, extra: crystal(fi, ri, 1),
        });
      } else if (kind === 'battle') {
        rooms.push({
          kind, enemy: buildEnemy(pick(r, DEEP.enemies), base + DEEP.enemyBonus + fi * DEEP.floorStep, tag),
          hpRatio: DEEP.enemyHpRatio, souls: DEEP.enemySouls, loot: null, extra: crystal(fi, ri, DEEP.enemyCrystalChance),
        });
      } else if (kind === 'chest') {
        rooms.push({ kind, souls: DEEP.chestSouls, loot: null, extra: crystal(fi, ri, 1) });
      } else {
        rooms.push({ kind, souls: 0, loot: null });
      }
    }
    floors.push(rooms);
  }
  const totalRooms = floors.reduce((a, f) => a + f.length, 0);
  return { catacombId: `abyss:${DEEP_KEY}`, name: DEEP.name, rank: '底', seed: s, level, floors, totalRooms, quality: 1, salt };
}

/** 淵結晶を落とすか（別の乱数で決める） */
function crystalDrop(tag: string, abyssKey: string, chance: number): LootDef | null {
  const r = seededRng(`crystal:${tag}`);
  return r() < chance ? { kind: 'crystal', id: 'crystal', tier: 3, crystal: rollCrystal(r, abyssKey) } : null;
}

/** 海底を作る。間取りと宝は固定、敵のレベルだけ入ったときの自分のレベルに合わせる */
export function buildSea(seed: string, level: number): Dungeon {
  const floors: Room[][] = SEAFLOOR.floors.map((rooms, fi) => rooms.map((room, ri): Room => {
    if (room.kind === 'battle' || room.kind === 'boss') {
      return {
        kind: room.kind, enemy: buildEnemy(room.enemy, abyssBaseLevel(level) + room.bonus, `abyss:sea:${fi}:${ri}`),
        hpRatio: room.hpRatio, souls: room.souls, loot: room.loot ?? null,
        // 淵結晶は追加の落とし物（海底の表そのものは変えない）
        extra: crystalDrop(`abyss:sea:${seed}:${fi}:${ri}`, SEA_KEY, room.kind === 'boss' ? 1 : CRYSTAL.seaDrop),
      };
    }
    if (room.kind === 'chest') return { kind: 'chest', souls: room.souls ?? 0, loot: room.loot ?? null };
    return { kind: 'bonfire', souls: 0, loot: null };
  }));
  const totalRooms = floors.reduce((a, r) => a + r.length, 0);
  return { catacombId: `abyss:${SEA_KEY}`, name: SEAFLOOR.name, rank: '底', seed, level, floors, totalRooms, quality: 1 };
}

/* ---------------- 困難な地下墓 ---------------- */

/** 困難な地下墓を作る。敵は書いたレベルが基本で、自分のほうが強ければ自分より上になるよう引き上げる */
export function buildFixed(key: string, level = 0): Dungeon {
  const f = FIXED_CATACOMBS[key];
  const floors: Room[][] = f.floors.map((rooms, fi) => rooms.map((room, ri): Room => {
    if (room.kind === 'battle' || room.kind === 'boss') {
      return {
        kind: room.kind,
        enemy: buildEnemy(room.enemy, Math.max(room.level, level + (room.kind === 'boss' ? DUNGEON.fixedAboveBoss : DUNGEON.fixedAboveEnemy)), `fixed:${key}:${fi}:${ri}`),
        hpRatio: room.hpRatio ?? 1, souls: room.souls, loot: room.loot ?? null,
      };
    }
    if (room.kind === 'chest') return { kind: 'chest', souls: room.souls ?? 0, loot: room.loot ?? null };
    return { kind: 'bonfire', souls: 0, loot: null };
  }));
  const totalRooms = floors.reduce((a, r) => a + r.length, 0);
  return {
    catacombId: `fixed:${key}`, name: f.name, rank: f.rank, seed: f.seed, level,
    floors, totalRooms, quality: 1,
  };
}

/* ---------------- 第1版の生成 ---------------- */

/** 地下墓を指定して作る（第1版。再開やテスト用） */
export function buildCatacomb(catacombId: string, seed: string, level: number): Dungeon {
  const cat = CATACOMBS[catacombId];
  const r = seededRng(`${catacombId}:${seed}`);
  const floorCount = randInt(r, DUNGEON.floorsMin, DUNGEON.floorsMax);
  const counts = Array.from({ length: floorCount }, () => randInt(r, DUNGEON.roomsMin, DUNGEON.roomsMax));
  const totalRooms = counts.reduce((a, b) => a + b, 0);
  const maxRooms = DUNGEON.floorsMax * DUNGEON.roomsMax;
  const minRooms = DUNGEON.floorsMin * DUNGEON.roomsMin;
  const quality = (totalRooms - minRooms) / (maxRooms - minRooms);

  const floors: Room[][] = counts.map((n, fi) => {
    const rooms: Room[] = [];
    const lastFloor = fi === floorCount - 1;
    // 各階層の最後は主。途中の階層は、主のあとに篝火（次の階層への入口）がある
    const bossAt = lastFloor ? n - 1 : n - 2;
    for (let ri = 0; ri < n; ri++) {
      let kind: RoomKind;
      if (ri === bossAt) kind = 'boss';
      else if (ri > bossAt) kind = 'bonfire';
      else if (ri === 0) kind = 'battle';
      else {
        kind = pickWeighted(r, DUNGEON.roomWeights);
        if (kind === 'bonfire' && rooms[ri - 1]?.kind === 'bonfire') kind = 'battle';
      }

      if (kind === 'battle' || kind === 'boss') {
        const boss = kind === 'boss';
        // 最後の階層の主はその地下墓の主。途中の階層の主は、道中の敵の強い個体
        const base = boss && lastFloor ? cat.boss : pick(r, cat.enemies);
        const def = boss && !lastFloor ? { ...base, name: `${base.name}（地下${fi + 1}層の主）` } : base;
        const off = cat.levelOffset ?? { enemy: DUNGEON.enemyLevelOffset, boss: DUNGEON.bossLevelOffset };
        const lv = Math.max(1, boss
          ? level + off.boss + fi * DUNGEON.enemyFloorStep
          : level + off.enemy + fi * DUNGEON.enemyFloorStep + ri * DUNGEON.enemyRoomStep);
        const drop = boss || r() < DUNGEON.dropChance ? rollLoot(r, cat, quality, fi, boss ? 2 : 1) : null;
        rooms.push({
          kind,
          enemy: buildEnemy(def, lv, `${catacombId}:${seed}:${fi}:${ri}`),
          hpRatio: boss ? (lastFloor ? DUNGEON.bossHpRatio : DUNGEON.floorBossHpRatio) : DUNGEON.enemyHpRatio,
          souls: enemySouls(lv) * (boss ? (lastFloor ? DUNGEON.bossMult : DUNGEON.floorBossMult) : 1),
          loot: drop,
        });
      } else if (kind === 'chest') {
        const souls = r() < DUNGEON.chestSoulsChance;
        rooms.push(souls
          ? { kind, souls: Math.max(1, level) * DUNGEON.chestSoulsPerLevel, loot: null }
          : { kind, souls: 0, loot: rollLoot(r, cat, quality, fi) });
      } else {
        rooms.push({ kind, souls: 0, loot: null });
      }
    }
    return rooms;
  });

  // 手がかりは別の乱数で決める（第1版の間取りや宝に影響しないように）
  floors.forEach((rooms, fi) => rooms.forEach((room, ri) => {
    const chance = room.kind === 'chest' ? FIXED.clueChestChance : room.kind === 'boss' ? FIXED.clueBossChance : 0;
    if (!chance) return;
    const cr = seededRng(`clue:${catacombId}:${seed}:${fi}:${ri}`);
    if (cr() < chance) room.clue = pick(cr, Object.keys(FIXED_CATACOMBS));
  }));

  return { catacombId, name: cat.name, rank: '通常', seed, level, floors, totalRooms, quality };
}
