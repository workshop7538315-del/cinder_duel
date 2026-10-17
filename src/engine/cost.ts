import type { Cost, Die } from './types';

export const sumDice = (dice: Die[]): number => dice.reduce((a, d) => a + d.v, 0);

/** 派生攻撃の stage 段目（0始まり）のコスト */
export const stageCost = (w: { first: number; inc: number }, stage: number): Cost => ({
  t: 'sum',
  n: w.first + w.inc * stage,
});

/** 払い方を自動で探す。sum は無駄（超過分）が最小、同じなら個数が少ない組み合わせ。 */
export function findPayment(dice: Die[], c: Cost): Die[] | null {
  if (c.t === 'sum') {
    const n = dice.length;
    let best = -1;
    let bestSum = Infinity;
    let bestCount = Infinity;
    for (let m = 1; m < 1 << n; m++) {
      let s = 0;
      let k = 0;
      for (let i = 0; i < n; i++) {
        if ((m >> i) & 1) {
          s += dice[i].v;
          k++;
        }
      }
      if (s >= c.n && (s < bestSum || (s === bestSum && k < bestCount))) {
        bestSum = s;
        bestCount = k;
        best = m;
      }
    }
    return best < 0 ? null : dice.filter((_, i) => (best >> i) & 1);
  }
  if (c.t === 'face') {
    const d = dice.filter((x) => c.f.includes(x.v)).sort((a, b) => a.v - b.v)[0];
    return d ? [d] : null;
  }
  const used = new Set<number>();
  const out: Die[] = [];
  for (const f of c.f) {
    const d = dice.find((x) => x.v === f && !used.has(x.id));
    if (!d) return null;
    used.add(d.id);
    out.push(d);
  }
  return out;
}

/** プレイヤーが選んだダイスでちょうど払えるか */
export function isValidPayment(sel: Die[], c: Cost): boolean {
  if (c.t === 'sum') return sel.length > 0 && sumDice(sel) >= c.n;
  if (c.t === 'face') return sel.length === 1 && c.f.includes(sel[0].v);
  const a = sel.map((d) => d.v).sort((x, y) => x - y).join();
  const b = [...c.f].sort((x, y) => x - y).join();
  return a === b;
}
