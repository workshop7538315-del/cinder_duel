/** シードから同じ乱数列を作る（同じシードなら同じ地下墓になる） */
export type SeededRng = () => number;

/** 文字列を32bitの数にする（FNV-1a） */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 */
export function seededRng(seed: string): SeededRng {
  let a = hashString(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const randInt = (r: SeededRng, min: number, max: number): number => min + Math.floor(r() * (max - min + 1));
export const pick = <T>(r: SeededRng, list: readonly T[]): T => list[Math.floor(r() * list.length)];

export function pickWeighted<K extends string>(r: SeededRng, weights: Record<K, number>): K {
  const entries = Object.entries(weights) as [K, number][];
  let x = r() * entries.reduce((a, [, w]) => a + w, 0);
  for (const [k, w] of entries) {
    x -= w;
    if (x < 0) return k;
  }
  return entries[entries.length - 1][0];
}

/** 人が読み書きしやすいシード（紛らわしい文字を除いた8文字） */
export function randomSeed(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}
