import { STARTER_DECK } from '../data/cards';
import { SHIELDS, WEAPONS, WEIGHTS } from '../data/equipment';
import { shuffle } from '../engine/dice';
import { derive } from '../engine/fighter';
import type { Fighter, FighterDef } from '../engine/types';

export function makeFighter(def: FighterDef, isPlayer: boolean): Fighter {
  const d = derive(def.stats);
  return {
    name: def.name,
    isPlayer,
    stats: { ...def.stats },
    weapon: WEAPONS[def.weapon],
    shield: def.shield ? SHIELDS[def.shield] : null,
    weight: WEIGHTS[def.weight],
    ...d,
    hp: d.maxHp,
    fp: d.maxFp,
    stamina: 0,
    speed: 0,
    speedRoll: [],
    action: [],
    hand: [],
    deck: isPlayer ? shuffle(STARTER_DECK.slice()) : [],
    discard: [],
    chain: 0,
    buffs: {},
  };
}
