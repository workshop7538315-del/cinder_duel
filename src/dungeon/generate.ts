import { autoAlloc, autoDeck, inventoryOf, loadout, type Character } from '../character/model';
import { CATACOMB_ORDER, CATACOMBS, DUNGEON, type CatacombDef, type EnemyDef, type LootDef } from '../data/catacombs';
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
}

export interface Dungeon {
  catacombId: string;
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

/** シードでどの地下墓かが決まる */
export function catacombFromSeed(seed: string): string {
  return pick(seededRng(`catacomb:${normalizeSeed(seed)}`), CATACOMB_ORDER);
}

/** シードから地下墓を作る。同じシード・レベルなら必ず同じ地下墓・同じ中身になる */
export function generateDungeon(seed: string, level: number): Dungeon {
  const s = normalizeSeed(seed);
  return buildCatacomb(catacombFromSeed(s), s, level);
}

/** 地下墓を指定して作る（再開やテスト用） */
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

  return { catacombId, seed, level, floors, totalRooms, quality };
}
