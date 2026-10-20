import { loadout, type Character } from '../character/model';
import { shuffle } from '../engine/dice';
import type { Fighter } from '../engine/types';
import { firstMove } from './pattern';
import { maxPoise } from '../engine/fighter';

export function makeFighter(c: Character, isPlayer: boolean): Fighter {
  const lo = loadout(c);
  const d = lo.derived;
  return {
    name: c.name,
    level: lo.level,
    isPlayer,
    stats: lo.stats,
    right: lo.right,
    left: lo.left,
    rightOk: lo.rightOk,
    leftOk: lo.leftOk,
    armorCut: lo.armorCut,
    weight: lo.weightClass,
    maxHp: d.maxHp,
    maxFp: d.maxFp,
    stInit: d.stInit,
    stMax: d.stMax,
    hp: d.maxHp,
    fp: d.maxFp,
    stamina: 0,
    speed: 0,
    speedRoll: [],
    action: [],
    hand: [],
    deck: shuffle([...c.deck]),
    discard: [],
    chain: 0,
    bleed: 0,
    buffs: {},
    acc: lo.acc,
    ...(c.behavior ? { pattern: { behavior: c.behavior, next: firstMove(c.behavior), rank: c.foeRank ?? '強敵' } } : {}),
    poise: maxPoise(lo.stats, lo.level, c.behavior ? c.foeRank ?? '強敵' : undefined),
    maxPoise: maxPoise(lo.stats, lo.level, c.behavior ? c.foeRank ?? '強敵' : undefined),
  };
}

/** 最大HPに倍率を掛ける（地下墓の道中の敵など） */
export function scaleHp(f: Fighter, ratio = 1): Fighter {
  if (ratio === 1) return f;
  f.maxHp = Math.max(1, Math.round(f.maxHp * ratio));
  f.hp = f.maxHp;
  return f;
}
