import type { Die } from './types';

export type Rng = () => number;
let rng: Rng = Math.random;

/** テスト用に乱数を差し替える */
export function setRng(r: Rng): void {
  rng = r;
}

export const d6 = (): number => 1 + Math.floor(rng() * 6);
export const rollMany = (n: number): number[] => Array.from({ length: n }, d6);
export const chance = (p: number): boolean => rng() < p;

let uid = 0;
export function rollDice(n: number): Die[] {
  return Array.from({ length: n }, () => ({ id: ++uid, v: d6(), fresh: true }));
}

export function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
