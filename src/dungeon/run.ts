import { newId, type Character } from '../character/model';
import type { Crystal } from '../engine/types';
import { DUNGEON, type LootDef } from '../data/catacombs';
import type { Dungeon, Room } from './generate';

export type RunStatus = 'active' | 'cleared' | 'retreated' | 'abandoned';

/** 倒れた部屋に落としたソウル（血痕） */
export interface Bloodstain {
  floor: number;
  room: number;
  souls: number;
}

/** 地下墓の探索中の状態。手に入れたものは、踏破するか篝火から退却するまで持ち帰れない。
 *  倒れると最初の部屋からやり直しになり、持っていたソウルは倒れた部屋に落ちる */
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
  /** 拾ったもの（floor は拾った階層） */
  loot: (LootDef & { floor?: number })[];
  status: RunStatus;
  /** 主を倒した階層。退却したとき、ここで拾ったものだけ持ち帰れる（倒れても消えない） */
  bossDown?: number[];
  /** 落としたソウル（なければ null） */
  stain?: Bloodstain | null;
  /** 宝箱を開けた・落とし物を拾った部屋（"階層:部屋"）。やり直しても二度は手に入らない */
  looted?: string[];
  /** 倒れた回数 */
  deaths?: number;
  /** 底に落ちたとき、入ろうとしていた困難な地下墓 */
  from?: string;
  /** 今の部屋を片付けた（先へ進むか、篝火に戻るかを選ぶところ） */
  cleared?: boolean;
  /** 最後にたどり着いた篝火の部屋（なければ入口の篝火） */
  bonfire?: { floor: number; room: number } | null;
  /** 入口の篝火にいる */
  atEntrance?: boolean;
  /** 周回（なければ1周目） */
  cycle?: number;
  /** 深海: 潜るたびに変わる値 */
  salt?: string;
}

export function startRun(charId: string, d: Dungeon): RunState {
  return {
    charId, catacombId: d.catacombId, seed: d.seed, level: d.level,
    floor: 0, room: 0, hp: null, fp: null, souls: 0, loot: [], status: 'active', stain: null, looted: [], deaths: 0,
    ...(d.cycle && d.cycle > 1 ? { cycle: d.cycle } : {}),
    ...(d.salt ? { salt: d.salt } : {}),
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
  const pos = run.room + 1 < d.floors[run.floor].length ? { floor: run.floor, room: run.room + 1 } : { floor: run.floor + 1, room: 0 };
  const isBonfire = d.floors[pos.floor]?.[pos.room]?.kind === 'bonfire';
  return { ...run, ...pos, cleared: false, atEntrance: false, bonfire: isBonfire ? pos : run.bonfire ?? null };
}

/** 片付けた部屋から先へ進む（倒した主の部屋もそのまま通れる） */
export const proceed = (d: Dungeon, run: RunState): RunState => advance(d, run);

/** この部屋の主はもう倒した（篝火に戻ってから通り直すとき） */
export const bossAlreadyDown = (d: Dungeon, run: RunState): boolean =>
  currentRoom(d, run)?.kind === 'boss' && (run.bossDown ?? []).includes(run.floor);

/** 篝火に戻る（最後にたどり着いた篝火。なければ入口）。そこまでの敵は復活する（宝箱と落とし物は戻らない） */
export function returnToBonfire(run: RunState): RunState {
  const b = run.bonfire ?? null;
  return b
    ? { ...run, floor: b.floor, room: b.room, cleared: false, atEntrance: false }
    : { ...run, floor: 0, room: 0, cleared: false, atEntrance: true };
}

/** 入口の篝火から出発する */
export const departEntrance = (run: RunState): RunState => ({ ...run, floor: 0, room: 0, atEntrance: false, cleared: false });

const roomKey = (run: RunState) => `${run.floor}:${run.room}`;
export const isLooted = (run: RunState): boolean => (run.looted ?? []).includes(roomKey(run));

/** 部屋の中身を得る。ソウルは毎回、物は一度きり（やり直しても二度は手に入らない） */
function gain(run: RunState, room: Room, souls: boolean): RunState {
  const first = !isLooted(run);
  return {
    ...run,
    souls: run.souls + (souls ? room.souls : 0),
    loot: first ? [...run.loot, ...[room.loot, room.extra].filter((l): l is LootDef => !!l).map((l) => ({ ...l, floor: run.floor }))] : run.loot,
    looted: first && (room.loot || room.extra || room.kind === 'chest') ? [...(run.looted ?? []), roomKey(run)] : run.looted ?? [],
  };
}

/** 今の部屋に自分の血痕があるか */
export const stainHere = (run: RunState): Bloodstain | null =>
  run.stain && run.stain.floor === run.floor && run.stain.room === run.room ? run.stain : null;

/** 宝箱を開ける。一度開けた宝箱は空 */
export function openChest(d: Dungeon, run: RunState): RunState {
  const room = currentRoom(d, run)!;
  return { ...(isLooted(run) ? run : gain(run, room, true)), cleared: true };
}

/** 落としたソウルを拾う（戦闘中に手番を使ったとき） */
export function retrieveStain(run: RunState): RunState {
  const s = stainHere(run);
  return s ? { ...run, souls: run.souls + s.souls, stain: null } : run;
}

/** 戦闘に勝った。血痕のある部屋なら、回収していなくても勝てば拾える */
export function winBattle(d: Dungeon, run: RunState, hp: number, fp: number): RunState {
  const room = currentRoom(d, run)!;
  const next = { ...gain(retrieveStain(run), room, true), hp, fp };
  if (room.kind === 'boss') {
    const bossDown = [...new Set([...(run.bossDown ?? []), run.floor])];
    if (run.floor === d.floors.length - 1) {
      return { ...next, bossDown, souls: next.souls + d.totalRooms * DUNGEON.clearBonusPerRoom, status: 'cleared' };
    }
    return { ...next, bossDown, cleared: true };
  }
  return { ...next, cleared: true };
}

/** 退却したときに持ち帰れる拾得物（主を倒した階層のもの） */
export const securedLoot = (run: RunState): RunState['loot'] =>
  run.status === 'cleared' ? run.loot : run.loot.filter((l) => (run.bossDown ?? []).includes(l.floor ?? 0));

/** 倒れた。持っていたソウルはこの部屋に落ち（前の血痕は消える）、最初の部屋からやり直す */
export function loseBattle(run: RunState): RunState {
  return {
    ...run,
    stain: run.souls > 0 ? { floor: run.floor, room: run.room, souls: run.souls } : null,
    souls: 0, floor: 0, room: 0, hp: null, fp: null, deaths: (run.deaths ?? 0) + 1, cleared: false, atEntrance: false,
  };
}

/** 探索を諦める。この探索で得たものはすべて失う */
export const abandon = (run: RunState): RunState => ({ ...run, status: 'abandoned' });

/** 篝火で休む（HP・FPが最大に戻る） */
export const rest = (run: RunState): RunState => ({ ...run, hp: null, fp: null });

/** 篝火から先へ進む */
export const leaveBonfire = (d: Dungeon, run: RunState): RunState => advance(d, run);

/** 篝火から退却する（ソウルと、主を倒した階層で拾ったものを持ち帰る） */
export const retreat = (run: RunState): RunState => ({ ...run, status: 'retreated' });

export interface Banked {
  souls: number;
  items: string[];
  cards: string[];
  /** すでに持っていたのでソウルに替えた装備 */
  dupes: string[];
  /** 主を倒していない階層で拾ったので、置いてきたもの */
  left: LootDef[];
  /** 持ち帰った淵結晶 */
  crystals: Crystal[];
}

/** 持ち帰ったものをキャラに加える（踏破・退却のときだけ） */
export function bankRun(c: Character, run: RunState): { character: Character; banked: Banked } {
  const banked: Banked = { souls: 0, items: [], cards: [], dupes: [], left: [], crystals: [] };
  if (run.status !== 'cleared' && run.status !== 'retreated') return { character: c, banked };
  const items = [...c.inventory.items];
  const cards = { ...c.inventory.cards };
  const crystals = [...(c.inventory.crystals ?? [])];
  let souls = run.souls;
  const secured = securedLoot(run);
  banked.left = run.loot.filter((l) => !secured.includes(l));
  for (const l of secured) {
    if (l.kind === 'crystal') {
      if (!l.crystal) continue;
      const got = { ...l.crystal, uid: newId() };
      crystals.push(got);
      banked.crystals.push(got);
    } else if (l.kind === 'card') {
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
    character: { ...c, inventory: { items, cards, crystals }, souls: c.souls + souls, updatedAt: Date.now() },
    banked,
  };
}
