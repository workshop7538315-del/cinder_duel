import { STAT_NAMES } from '../data/classes';
import type { Cost, DamageType, Requirements } from './types';

export function costLabel(c: Cost, fp = 0): string {
  let s: string;
  if (c.t === 'sum') s = `[${c.n}]`;
  else if (c.t === 'face') {
    const k = c.f.join();
    s = k === '2,4,6' ? '[偶数の目]' : k === '1,3,5' ? '[奇数の目]' : `[${c.f.join('か')}の目]`;
  } else s = `[${c.f.join('・')}を1個ずつ]`;
  return fp ? `${s}+FP${fp}` : s;
}

export const TYPE_NAMES: Record<DamageType, string> = { phys: '物理', magic: '魔力', holy: '聖' };
export const typeName = (t: DamageType): string => TYPE_NAMES[t];

export function reqLabel(req: Requirements): string {
  const e = Object.entries(req);
  return e.length ? e.map(([k, v]) => `${STAT_NAMES[k as keyof Requirements]}${v}`).join('・') : 'なし';
}

export const pct = (x: number): string => `${Math.round(x * 100)}%`;
export const kg = (x: number): string => x.toFixed(1);
