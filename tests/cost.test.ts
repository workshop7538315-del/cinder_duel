import { describe, expect, it } from 'vitest';
import { findPayment, isValidPayment, stageCost } from '../src/engine/cost';
import type { Die } from '../src/engine/types';

const dice = (...v: number[]): Die[] => v.map((x, i) => ({ id: i + 1, v: x }));
const vals = (d: Die[] | null) => d?.map((x) => x.v).sort((a, b) => a - b) ?? null;

describe('合計コスト [N]', () => {
  it('無駄が最小の組み合わせを選ぶ', () => {
    expect(vals(findPayment(dice(6, 2, 3), { t: 'sum', n: 5 }))).toEqual([2, 3]);
  });
  it('同じ合計なら個数が少ない方', () => {
    expect(vals(findPayment(dice(1, 3, 4), { t: 'sum', n: 4 }))).toEqual([4]);
  });
  it('足りなければ払えない', () => {
    expect(findPayment(dice(1, 1), { t: 'sum', n: 3 })).toBeNull();
  });
});

describe('派生攻撃', () => {
  it('ダガー [2]+[2] は 2段目が [4]', () => {
    expect(stageCost({ first: 2, inc: 2 }, 0)).toEqual({ t: 'sum', n: 2 });
    expect(stageCost({ first: 2, inc: 2 }, 1)).toEqual({ t: 'sum', n: 4 });
  });
  it('6 が1個だけなら1段目にしか使えない', () => {
    const pool = dice(6);
    const first = findPayment(pool, stageCost({ first: 2, inc: 2 }, 0))!;
    const rest = pool.filter((d) => !first.includes(d));
    expect(findPayment(rest, stageCost({ first: 2, inc: 2 }, 1))).toBeNull();
  });
});

describe('条件つきコスト', () => {
  it('[1の目]', () => {
    expect(vals(findPayment(dice(3, 1), { t: 'face', f: [1] }))).toEqual([1]);
    expect(findPayment(dice(2, 3), { t: 'face', f: [1] })).toBeNull();
  });
  it('[偶数の目] は一番小さい偶数を使う', () => {
    expect(vals(findPayment(dice(6, 3, 2), { t: 'face', f: [2, 4, 6] }))).toEqual([2]);
  });
  it('[1・2・3を1個ずつ]', () => {
    expect(vals(findPayment(dice(3, 1, 5, 2), { t: 'set', f: [1, 2, 3] }))).toEqual([1, 2, 3]);
    expect(findPayment(dice(1, 1, 3), { t: 'set', f: [1, 2, 3] })).toBeNull();
  });
});

describe('プレイヤーが選んだダイス', () => {
  it('合計が足りれば有効', () => {
    expect(isValidPayment(dice(4, 2), { t: 'sum', n: 5 })).toBe(true);
    expect(isValidPayment(dice(2), { t: 'sum', n: 5 })).toBe(false);
  });
  it('[1の目] は1個だけ', () => {
    expect(isValidPayment(dice(1, 1), { t: 'face', f: [1] })).toBe(false);
  });
  it('セットは過不足なく', () => {
    expect(isValidPayment(dice(3, 2, 1), { t: 'set', f: [1, 2, 3] })).toBe(true);
    expect(isValidPayment(dice(3, 2, 1, 4), { t: 'set', f: [1, 2, 3] })).toBe(false);
  });
});
