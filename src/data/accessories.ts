import { STAT_NAMES } from './classes';
import type { Accessory, StatKey } from '../engine/types';

const pct = (x: number) => `${Math.round(x * 100)}%`;
/** 効果の説明 */
export function accessoryText(a: Accessory): string {
  const e = a.effect;
  const parts: string[] = [];
  for (const [k, v] of Object.entries(e.stats ?? {}) as [StatKey, number][]) parts.push(`${STAT_NAMES[k]}+${v}`);
  if (e.hpPct) parts.push(`最大HP+${pct(e.hpPct)}`);
  if (e.fp) parts.push(`最大FP+${e.fp}`);
  if (e.stInit) parts.push(`初期スタミナダイス+${e.stInit}`);
  if (e.cut?.phys) parts.push(`物理カット+${pct(e.cut.phys)}`);
  if (e.cut?.magic) parts.push(`魔力カット+${pct(e.cut.magic)}`);
  if (e.cut?.holy) parts.push(`聖カット+${pct(e.cut.holy)}`);
  if (e.guardDiscount) parts.push(`ガード消費-${e.guardDiscount}`);
  if (e.healPct) parts.push(`回復量+${pct(e.healPct)}`);
  if (e.bleedPct) parts.push(`与える出血+${pct(e.bleedPct)}`);
  return parts.join('・');
}

/**
 * アクセサリ（指輪・タリスマン）。指輪とタリスマンは呼び名が違うだけで、仕組みは同じ。
 * 4つまで身につけられる（同じものは1つだけ）。地下墓の2周目以降で手に入る。
 * ※IDは改名・削除しない（古いセーブが壊れる）
 */
export const ACCESSORIES: Record<string, Accessory> = {
  // 煤けた騎士の地下墓
  iron_ring: { name: '鉄壁の指輪', kind: '指輪', weight: 0.5, effect: { cut: { phys: 0.1 } } },
  shield_talisman: { name: '盾のタリスマン', kind: 'タリスマン', weight: 0.7, effect: { guardDiscount: 1 } },
  // 煤けた戦士の地下墓
  might_talisman: { name: '剛力のタリスマン', kind: 'タリスマン', weight: 0.6, effect: { stats: { str: 5 } } },
  life_ring: { name: '生命の指輪', kind: '指輪', weight: 0.5, effect: { hpPct: 0.1 } },
  // 煤けた刀使の地下墓
  blade_ring: { name: '剣技の指輪', kind: '指輪', weight: 0.5, effect: { stats: { dex: 5 } } },
  breath_talisman: { name: '息吹のタリスマン', kind: 'タリスマン', weight: 0.6, effect: { stInit: 1 } },
  // 煤けた魔術師の地下墓
  star_ring: { name: '星の指輪', kind: '指輪', weight: 0.5, effect: { stats: { int: 5 } } },
  mind_talisman: { name: '精神のタリスマン', kind: 'タリスマン', weight: 0.5, effect: { fp: 5 } },
  // 煤けた聖職者の地下墓
  prayer_ring: { name: '祈りの指輪', kind: '指輪', weight: 0.5, effect: { stats: { fai: 5 } } },
  blessing_talisman: { name: '祝福のタリスマン', kind: 'タリスマン', weight: 0.7, effect: { healPct: 0.25 } },
  // 血盟騎士の地下墓
  blood_ring: { name: '血の指輪', kind: '指輪', weight: 0.5, effect: { stats: { arc: 5 } } },
  claw_talisman: { name: '血爪のタリスマン', kind: 'タリスマン', weight: 0.6, effect: { bleedPct: 0.25 } },
};

/** 地下墓ごとに出るアクセサリ（2周目以降） */
export const CATACOMB_ACCESSORIES: Record<string, string[]> = {
  knight: ['iron_ring', 'shield_talisman'],
  warrior: ['might_talisman', 'life_ring'],
  samurai: ['blade_ring', 'breath_talisman'],
  sorcerer: ['star_ring', 'mind_talisman'],
  cleric: ['prayer_ring', 'blessing_talisman'],
  blood: ['blood_ring', 'claw_talisman'],
};
