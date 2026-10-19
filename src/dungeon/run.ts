import type { Character } from '../character/model';
import { DUNGEON, type LootDef } from '../data/catacombs';
import type { Dungeon, Room } from './generate';

export type RunStatus = 'active' | 'dead' | 'cleared' | 'retreated';

/** 地下墓の探索中の状態。手に入れたものは、踏破するか篝火から退却するまで持ち帰れない */
export interface RunState {
  charId: string;
  catacombId: string;
  seed: string;
  /** 入ったときの自分のレベル（地下墓を作り直すのに使う） */
  level: number;
  floor: number;
  room: number;
  /** 部屋をまたいで持ち越すHP・FP（null なら最大） */
  hp: number | null;
  fp: number | null;
  souls: number;
  loot: LootDef[];
  status: RunStatus;
}

export function startRun(charId: string, d: Dungeon): RunState {
  return {
    charId, catacombId: d.catacombId, seed: d.seed, level: d.level,
    floor: 0, room: 0, hp: null, fp: null, souls: 0, loot: [], status: 'active',
  };
}

export function currentRoom(d: Dungeon, run: RunState): Room | null {
  return d.floors[run.floor]?.[run.room] ?? null;
}

/** 今の部屋が何部屋目か（1始まり） */
export function roomNumber(d: Dungeon, run: RunState): number {
  return d.floors.slice(0, run.floor).reduce((a, f) => a + f.length, 0) + run.room + 1;
}

function advance(d: Dungeon, run: RunState): RunState {
  if (run.room + 1 < d.floors[run.floor].length) return { ...run, room: run.room + 1 };
  return { ...run, floor: run.floor + 1, room: 0 };
}

const gain = (run: RunState, room: Room): RunState => ({
  ...run, souls: run.souls + room.souls, loot: room.loot ? [...run.loot, room.loot] : run.loot,
});

export function openChest(d: Dungeon, run: RunState): RunState {
  return advance(d, gain(run, currentRoom(d, run)!));
}

export function winBattle(d: Dungeon, run: RunState, hp: number, fp: number): RunState {
  const room = currentRoom(d, run)!;
  const next = { ...gain(run, room), hp, fp };
  if (room.kind === 'boss') {
    return { ...next, souls: next.souls + d.totalRooms * DUNGEON.clearBonusPerRoom, status: 'cleared' };
  }
  return advance(d, next);
}

export const loseBattle = (run: RunState): RunState => ({ ...run, status: 'dead' });

/** 篝火で休む（HP・FPが最大に戻る） */
export const rest = (run: RunState): RunState => ({ ...run, hp: null, fp: null });

/** 篝火から先へ進む */
export const leaveBonfire = (d: Dungeon, run: RunState): RunState => advance(d, run);

/** 篝火から退却する（手に入れたものを持ち帰る） */
export const retreat = (run: RunState): RunState => ({ ...run, status: 'retreated' });

export interface Banked {
  souls: number;
  items: string[];
  cards: string[];
  /** すでに持っていたのでソウルに替えた装備 */
  dupes: string[];
}

/** 持ち帰ったものをキャラに加える（踏破・退却のときだけ） */
export function bankRun(c: Character, run: RunState): { character: Character; banked: Banked } {
  const banked: Banked = { souls: 0, items: [], cards: [], dupes: [] };
  if (run.status !== 'cleared' && run.status !== 'retreated') return { character: c, banked };
  const items = [...c.inventory.items];
  const cards = { ...c.inventory.cards };
  let souls = run.souls;
  for (const l of run.loot) {
    if (l.kind === 'card') {
      cards[l.id] = (cards[l.id] ?? 0) + 1;
      banked.cards.push(l.id);
    } else if (items.includes(l.id)) {
      souls += l.tier * DUNGEON.dupeSouls;
      banked.dupes.push(l.id);
    } else {
      items.push(l.id);
      banked.items.push(l.id);
    }
  }
  banked.souls = souls;
  return {
    character: { ...c, inventory: { items, cards }, souls: c.souls + souls, updatedAt: Date.now() },
    banked,
  };
}
