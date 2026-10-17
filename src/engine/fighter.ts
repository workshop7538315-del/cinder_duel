import { RULES } from '../data/rules';
import { shuffle } from './dice';
import type { DamageType, Die, Fighter, Stats } from './types';

/** 生命力・精神・持久から派生値を出す */
export function derive(s: Stats) {
  return {
    maxHp: RULES.hpBase + s.vit * RULES.hpPerVit,
    maxFp: s.att * RULES.fpPerMind,
    stInit: RULES.stInitBase + Math.floor(s.end / RULES.stInitPerEnd),
    stMax: Math.floor(s.end / RULES.stMaxPerEnd),
  };
}

/** ガード消費: 受けるはずだったダメージが大きいほど重い */
export function guardCost(f: Fighter, raw: number): number {
  let c = RULES.guardBase + Math.floor(raw / RULES.guardPer);
  if (f.buffs.stance) c -= RULES.stanceGuardDiscount;
  if (f.buffs.broken) c += RULES.kickBreak;
  return Math.max(1, c);
}

/** カット率: 武器と盾の受け能力の高い方 */
export function guardCut(f: Fighter, type: DamageType): number {
  let c = f.weapon.cut[type];
  if (f.shield) c = Math.max(c, f.shield.cut[type]);
  if (f.buffs.stance) c += RULES.stanceCutBonus;
  return Math.min(1, c);
}

export const dodgeCost = (f: Fighter): number => f.weight.dodge;

export function applyArmor(def: Fighter, type: DamageType, raw: number): number {
  return type === 'phys' ? Math.max(1, raw - def.weight.armor) : raw;
}

export function drawCard(f: Fighter): string | null {
  if (!f.deck.length) {
    f.deck = shuffle(f.discard);
    f.discard = [];
  }
  const c = f.deck.pop();
  if (c) f.hand.push(c);
  return c ?? null;
}

export function spend(f: Fighter, pay: Die[]): void {
  const ids = new Set(pay.map((d) => d.id));
  f.action = f.action.filter((d) => !ids.has(d.id));
}
