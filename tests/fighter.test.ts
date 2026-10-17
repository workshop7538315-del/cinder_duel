import { describe, expect, it } from 'vitest';
import { CLASSES } from '../src/data/fighters';
import { derive, guardCost, guardCut } from '../src/engine/fighter';
import { grade, scaled } from '../src/engine/scaling';
import { makeFighter } from '../src/game/setup';

describe('派生値', () => {
  it('持久12 → 初期3・上限6', () => {
    const d = derive({ ...CLASSES.knight.stats, end: 12 });
    expect(d.stInit).toBe(3);
    expect(d.stMax).toBe(6);
  });
});

describe('能力補正', () => {
  it('基礎値 + 能力値×係数（切り捨て）', () => {
    const s = { ...CLASSES.knight.stats, str: 16, dex: 9 };
    expect(scaled({ base: 10, scale: { str: 0.5 } }, s)).toBe(18);
    expect(scaled({ base: 6, scale: { str: 0.25, dex: 0.25 } }, s)).toBe(12);
  });
  it('ランク', () => {
    expect([1.0, 0.8, 0.5, 0.3, 0.15, 0.1].map(grade)).toEqual(['S', 'A', 'B', 'C', 'D', 'E']);
  });
});

describe('ガード', () => {
  it('盾は物理を全部カット、剣は半分', () => {
    const knight = makeFighter(CLASSES.knight, true);
    const warrior = makeFighter(CLASSES.warrior, true);
    expect(guardCut(knight, 'phys')).toBe(1);
    expect(guardCut(warrior, 'phys')).toBe(0.6);
  });
  it('受けるはずのダメージが大きいほど消費が重い', () => {
    const f = makeFighter(CLASSES.knight, true);
    expect(guardCost(f, 5)).toBe(1);
    expect(guardCost(f, 12)).toBe(3);
    f.buffs.broken = true;
    expect(guardCost(f, 12)).toBe(6);
  });
});
