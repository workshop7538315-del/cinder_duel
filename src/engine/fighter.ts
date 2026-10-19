import { RULES } from '../data/rules';
import { shuffle } from './dice';
import { scaled } from './scaling';
import type { DamageType, Die, Fighter, School, Scaling, Weapon } from './types';

/** 武器攻撃・戦技のダメージ。装備条件を満たさないと基礎値に倍率が掛かり、補正もなくなる。 */
export function weaponDamage(f: Fighter, s: Scaling): number {
  return f.rightOk ? scaled(s, f.stats) : Math.floor(s.base * RULES.reqPenalty);
}

/** 武器の出血値（装備条件を満たさないと基礎値×倍率のみ） */
export function weaponBleed(f: Fighter, s: Scaling | undefined): number {
  if (!s) return 0;
  return f.rightOk ? scaled(s, f.stats) : Math.floor(s.base * RULES.reqPenalty);
}

export const enchantBonus = (f: Fighter): number => f.buffs.enchant?.bonus ?? 0;
export const enchantBleed = (f: Fighter): number => f.buffs.enchant?.bleed ?? 0;

/** 出血を溜める。弾けたらそのダメージを返す（弾けなければ 0） */
export function addBleed(f: Fighter, amount: number): number {
  if (amount <= 0) return 0;
  f.bleed += amount;
  if (f.bleed < RULES.bleedThreshold) return 0;
  f.bleed = 0;
  return Math.round(f.maxHp * RULES.bleedBurstRatio) + RULES.bleedBurstBase;
}

/** 呪死を溜める。溜まりきったら true（即死） */
export function addCurse(f: Fighter, amount: number): boolean {
  if (amount <= 0) return false;
  f.curse = (f.curse ?? 0) + amount;
  if (f.curse < RULES.curseThreshold) return false;
  f.curse = 0;
  return true;
}

/** その系統の触媒を持っていれば、その触媒（右手優先） */
export function catalystFor(f: Fighter, school: School): { item: Weapon; ok: boolean } | null {
  // 触媒（杖・聖印）と、触媒を兼ねる武器（底の剣など）
  if (f.right.school === school) return { item: f.right, ok: f.rightOk };
  const l = f.left;
  if (l && l.kind !== 'shield' && l.school === school) return { item: l, ok: f.leftOk };
  return null;
}

/** 触媒の威力（魔術・祈祷に上乗せ）。触媒がなければ null */
export function spellPower(f: Fighter, school: School): number | null {
  const c = catalystFor(f, school);
  if (!c || !c.item.power) return null;
  return c.ok ? scaled(c.item.power, f.stats) : Math.floor(c.item.power.base * RULES.reqPenalty);
}

/** ガード消費: 受けるはずだったダメージが大きいほど重い */
export function guardCost(f: Fighter, raw: number): number {
  let c = RULES.guardBase + Math.floor(raw / RULES.guardPer);
  if (f.left?.kind === 'shield') c -= f.left.guardBonus ?? 0;
  if (f.buffs.stance) c -= RULES.stanceGuardDiscount;
  if (f.buffs.broken) c += RULES.kickBreak;
  return Math.max(1, c);
}

/** カット率: 両手に持ったものの受け能力の高い方 */
export function guardCut(f: Fighter, type: DamageType): number {
  let c = f.right.cut[type] * (f.rightOk ? 1 : RULES.reqPenalty);
  if (f.left) c = Math.max(c, f.left.cut[type] * (f.leftOk ? 1 : RULES.reqPenalty));
  if (f.buffs.stance) c += RULES.stanceCutBonus;
  return Math.min(1, c);
}

export const dodgeCost = (f: Fighter): number | null => f.weight.dodge;

/** 防具のカット率で減らす（最低1） */
export function applyArmor(def: Fighter, type: DamageType, raw: number): number {
  return Math.max(1, Math.round(raw * (1 - def.armorCut[type])));
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
