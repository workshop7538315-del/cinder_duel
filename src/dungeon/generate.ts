import { autoAlloc, autoDeck, inventoryOf, loadout, type Character } from '../character/model';
import { CATACOMB_ORDER, CATACOMBS, DUNGEON, type CatacombDef, type EnemyDef, type LootDef } from '../data/catacombs';
import { ABYSS, ABYSSES, BASILISK } from '../data/abyss';
import { FIXED, FIXED_CATACOMBS } from '../data/fixed';
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
}

export const ROOM_NAMES: Record<RoomKind, string> = { battle: '敵', chest: '宝箱', bonfire: '篝火', boss: '主' };

function buildEnemy(def: EnemyDef, level: number, tag: string): Character {
  const c: Character = {
    id: `enemy:${tag}`, name: def.name, classId: def.classId,
    alloc: autoAlloc(def.classId, level, def.focus), equip: { ...def.equip },
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
export const CURRENT_SEED_VERSION = 1;

type Generator = (seed: string, level: number) => Dungeon;

const GENERATORS: Record<number, Generator> = {
  1: (seed, level) => buildCatacomb(catacombFromSeedV1(seed), seed, level),
};

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
export function generateDungeon(seed: string, level: number): Dungeon {
  const s = normalizeSeed(seed);
  const fixed = fixedFromSeed(s);
  if (fixed) return buildFixed(fixed);
  const gen = GENERATORS[seedVersion(s)];
  if (!gen) throw new Error('このシードは新しいバージョンのものです。ページを再読み込みしてください。');
  return gen(s, level);
}

/** 探索を再開するとき（入ったときの地下墓をそのまま作り直す） */
export function rebuildDungeon(catacombId: string, seed: string, level: number): Dungeon {
  if (catacombId.startsWith('fixed:')) return buildFixed(catacombId.slice(6));
  if (catacombId.startsWith('abyss:')) return buildAbyss(catacombId.slice(6), seed, level);
  const gen = GENERATORS[seedVersion(seed)] ?? GENERATORS[1];
  const d = gen(seed, level);
  return d.catacombId === catacombId ? d : buildCatacomb(catacombId, seed, level);
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
  const a = ABYSSES[key];
  const r = seededRng(`abyss:${key}:${seed}`);
  const bl = Math.max(1, level + ABYSS.basiliskLevelBonus);
  const hl = Math.max(1, level + ABYSS.hunterLevelBonus);
  const basilisk = (ri: number): Room => ({
    kind: 'battle', enemy: buildEnemy(BASILISK, bl, `abyss:${key}:${seed}:${ri}`), hpRatio: ABYSS.basiliskHpRatio,
    souls: ABYSS.basiliskSouls, loot: r() < ABYSS.basiliskDropChance ? pick(r, a.loot) : null,
  });
  const floors: Room[][] = [[
    basilisk(0),
    basilisk(1),
    {
      kind: 'boss', enemy: buildEnemy({ ...a.hunter, name: `${a.hunter.name}（${a.name}）` }, hl, `abyss:${key}:${seed}:2`),
      hpRatio: ABYSS.hunterHpRatio, souls: ABYSS.hunterSouls, loot: pick(r, a.loot),
    },
  ]];
  return { catacombId: `abyss:${key}`, name: a.name, rank: '底', seed, level, floors, totalRooms: 3, quality: 0 };
}

/** どの底に落ちるか */
export const pickAbyss = (rand: () => number = Math.random): string => {
  const keys = Object.keys(ABYSSES);
  return keys[Math.floor(rand() * keys.length)];
};

/* ---------------- 困難な地下墓 ---------------- */

export function buildFixed(key: string): Dungeon {
  const f = FIXED_CATACOMBS[key];
  const floors: Room[][] = f.floors.map((rooms, fi) => rooms.map((room, ri): Room => {
    if (room.kind === 'battle' || room.kind === 'boss') {
      return {
        kind: room.kind, enemy: buildEnemy(room.enemy, room.level, `fixed:${key}:${fi}:${ri}`),
        hpRatio: room.hpRatio ?? 1, souls: room.souls, loot: room.loot ?? null,
      };
    }
    if (room.kind === 'chest') return { kind: 'chest', souls: room.souls ?? 0, loot: room.loot ?? null };
    return { kind: 'bonfire', souls: 0, loot: null };
  }));
  const totalRooms = floors.reduce((a, r) => a + r.length, 0);
  return {
    catacombId: `fixed:${key}`, name: f.name, rank: f.rank, seed: f.seed, level: f.recommendedLevel,
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
        const lv = Math.max(1, boss
          ? level + DUNGEON.bossLevelOffset + fi * DUNGEON.enemyFloorStep
          : level + DUNGEON.enemyLevelOffset + fi * DUNGEON.enemyFloorStep + ri * DUNGEON.enemyRoomStep);
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
