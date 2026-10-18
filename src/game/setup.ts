import { loadout, type Character } from '../character/model';
import { shuffle } from '../engine/dice';
import type { Fighter } from '../engine/types';

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
    buffs: {},
  };
}
