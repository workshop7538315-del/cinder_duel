import { CURVES, RULES, type Curve } from '../data/rules';
import type { Requirements, Stats, WeightKey } from './types';

/** 曲線上の値（点と点の間は直線、範囲外は端の値） */
export function curve(points: Curve, x: number): number {
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i];
    if (x <= x1) {
      const [x0, y0] = points[i - 1];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return points[points.length - 1][1];
}

/** 生命力・精神・持久から派生値を出す */
export function derive(s: Stats) {
  return {
    maxHp: Math.floor(curve(CURVES.hp, s.vit)),
    maxFp: Math.floor(curve(CURVES.fp, s.att)),
    stInit: Math.floor(curve(CURVES.stInit, s.end)),
    stMax: Math.floor(curve(CURVES.stMax, s.end)),
    equipLoad: Math.round(curve(CURVES.equipLoad, s.end) * 10) / 10,
  };
}

/** レベル = 能力値の合計 − 79（エルデンリングと同じ） */
export const levelOf = (s: Stats): number => Object.values(s).reduce((a, b) => a + b, 0) - 79;

export function weightKey(ratio: number): WeightKey {
  if (ratio <= RULES.loadLight) return 'light';
  if (ratio <= RULES.loadMedium) return 'medium';
  if (ratio <= RULES.loadHeavy) return 'heavy';
  return 'over';
}

/** 満たしていない装備条件（なければ空） */
export function unmetReq(req: Requirements, s: Stats): [keyof Requirements, number][] {
  return (Object.entries(req) as [keyof Requirements, number][]).filter(([k, v]) => s[k] < v);
}
export const meetsReq = (req: Requirements, s: Stats): boolean => unmetReq(req, s).length === 0;
