import type { ScaleStat, Scaling, Stats } from './types';

export function scaled(s: Scaling, stats: Stats): number {
  let bonus = 0;
  for (const [k, c] of Object.entries(s.scale) as [ScaleStat, number][]) bonus += stats[k] * c;
  return s.base + Math.floor(bonus);
}

/** 係数を S〜E のランクで表す */
export const grade = (c: number): string =>
  c >= 1.0 ? 'S' : c >= 0.8 ? 'A' : c >= 0.5 ? 'B' : c >= 0.3 ? 'C' : c >= 0.15 ? 'D' : 'E';

const SHORT: Record<ScaleStat, string> = { str: '筋', dex: '技', int: '知', fai: '信', arc: '神' };

export function scaleLabel(s: Scaling): string {
  const parts = (Object.entries(s.scale) as [ScaleStat, number][]).map(([k, c]) => SHORT[k] + grade(c));
  return parts.length ? `補正 ${parts.join(' ')}` : '補正なし';
}
