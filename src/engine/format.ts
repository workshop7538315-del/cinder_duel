import type { Cost, DamageType } from './types';

export function costLabel(c: Cost, fp = 0): string {
  let s: string;
  if (c.t === 'sum') s = `[${c.n}]`;
  else if (c.t === 'face') {
    const k = c.f.join();
    s = k === '2,4,6' ? '[偶数の目]' : k === '1,3,5' ? '[奇数の目]' : `[${c.f.join('か')}の目]`;
  } else s = `[${c.f.join('・')}を1個ずつ]`;
  return fp ? `${s}+FP${fp}` : s;
}

export const typeName = (t: DamageType): string => (t === 'magic' ? '魔法' : '物理');
