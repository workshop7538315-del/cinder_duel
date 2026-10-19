import { describe, expect, it } from 'vitest';
import fixture from './fixtures/seeds-v1.json';
import { charLevel } from '../src/character/model';
import { FIXED_CATACOMBS } from '../src/data/fixed';
import {
  buildFixed, catacombFromSeed, CURRENT_SEED_VERSION, fixedFromSeed, generateDungeon, rebuildDungeon, seedVersion,
  strayInto, versionedSeed,
} from '../src/dungeon/generate';

/**
 * 第1版のシードが、更新しても同じ地下墓・間取り・敵・宝になることを確かめる。
 * このテストが落ちたら、第1版の生成（またはその表）を変えてしまっている。
 * 生成を変えたいときは、第1版を残したまま第2版を足すこと（src/dungeon/generate.ts の GENERATORS）。
 * 敵のレベル・HP・ソウル量などの数値調整は、ここでは見ていない（変えてよい）。
 */
describe('シードを守る（第1版）', () => {
  it.each(fixture.map((f) => [f.seed, f]))('%s', (_seed, f) => {
    const d = generateDungeon(f.seed, 30);
    expect(d.catacombId).toBe(f.catacombId);
    const now = d.floors.map((fl) => fl.map((r) => ({
      kind: r.kind,
      enemy: r.enemy ? `${r.enemy.name}/${r.enemy.classId}/${r.enemy.equip.right}` : null,
      loot: r.loot ? `${r.loot.kind}:${r.loot.id}` : null,
      soulsChest: r.kind === 'chest' && !r.loot,
    })));
    expect(now).toEqual(f.floors);
  });
  it('版のついたシードとつかないシード', () => {
    expect(seedVersion('k3d9xq2m')).toBe(1);
    expect(seedVersion('1-k3d9xq2m')).toBe(1);
    expect(seedVersion('2-abc')).toBe(2);
    expect(versionedSeed('abc')).toBe(`${CURRENT_SEED_VERSION}-abc`);
  });
  it('まだない版のシードは、わかるメッセージで断る', () => {
    expect(() => generateDungeon('99-abc', 30)).toThrow(/新しいバージョン/);
  });
});

describe('困難な地下墓', () => {
  it('決まったシードでだけ入れ、中身は毎回同じ（推奨レベルより下なら敵のレベルも固定）', () => {
    for (const [key, f] of Object.entries(FIXED_CATACOMBS)) {
      expect(fixedFromSeed(f.seed)).toBe(key);
      expect(fixedFromSeed(` ${f.seed.toUpperCase()} `)).toBe(key);
      const a = generateDungeon(f.seed, 10);
      const b = generateDungeon(f.seed, 40);
      expect(a.rank).toBe('困難');
      expect(a.name).toBe(f.name);
      expect(a.floors).toEqual(b.floors);
      expect(catacombFromSeed(f.seed)).toBe(`fixed:${key}`);
      expect(rebuildDungeon(`fixed:${key}`, f.seed, 10)).toEqual(a);
      // 自分のほうが強ければ、敵は自分より上に引き上げられる（間取り・敵の種類・宝は同じ）
      const hi = generateDungeon(f.seed, 120);
      expect(hi.floors.map((fl) => fl.map((r) => [r.kind, r.loot]))).toEqual(a.floors.map((fl) => fl.map((r) => [r.kind, r.loot])));
      for (const r of hi.floors.flat()) if (r.enemy) expect(charLevel(r.enemy)).toBeGreaterThan(120);
    }
  });
  it('各階層の最後は主で、途中の階層は主のあとに篝火', () => {
    for (const key of Object.keys(FIXED_CATACOMBS)) {
      const d = buildFixed(key);
      d.floors.forEach((f, fi) => {
        const last = fi === d.floors.length - 1;
        expect(f[f.length - 1].kind, `${key} ${fi}`).toBe(last ? 'boss' : 'bonfire');
        if (!last) expect(f[f.length - 2].kind).toBe('boss');
      });
    }
  });
  it('用意されたシードのまま入ると、まれに迷い込む', () => {
    expect(strayInto(() => 0.99)).toBeNull();
    const seed = strayInto(() => 0)!;
    expect(fixedFromSeed(seed)).toBeTruthy();
  });
  it('通常の地下墓のどこかで、手がかりが見つかる', () => {
    let clues = 0;
    for (let i = 0; i < 300; i++) {
      const d = generateDungeon(`c${i}`, 30);
      for (const f of d.floors) for (const r of f) if (r.clue) {
        clues++;
        expect(FIXED_CATACOMBS[r.clue]).toBeTruthy();
        expect(['chest', 'boss']).toContain(r.kind);
      }
    }
    expect(clues).toBeGreaterThan(5);
    expect(clues).toBeLessThan(150);
  });
});
