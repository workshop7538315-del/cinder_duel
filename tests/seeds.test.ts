import { describe, expect, it } from 'vitest';
import fixture from './fixtures/seeds-v1.json';
import fixtureV2 from './fixtures/seeds-v2.json';
import fixtureV3 from './fixtures/seeds-v3.json';
import { charLevel } from '../src/character/model';
import { FIXED_CATACOMBS } from '../src/data/fixed';
import {
  buildFixed, catacombFromSeed, CURRENT_SEED_VERSION, fixedFromSeed, generateDungeon, rebuildDungeon, seedVersion,
  strayInto, versionedSeed, buildCatacomb, normalizeSeed,
} from '../src/dungeon/generate';

/**
 * 第1版・第2版・第3版のシードが、更新しても同じ地下墓・間取り・敵・宝になることを確かめる。
 * このテストが落ちたら、第1版の生成（またはその表）を変えてしまっている。
 * 生成を変えたいときは、第1版を残したまま第2版を足すこと（src/dungeon/generate.ts の GENERATORS）。
 * 敵のレベル・HP・ソウル量などの数値調整は、ここでは見ていない（変えてよい）。
 */
describe.each([['第1版', fixture], ['第2版', fixtureV2], ['第3版', fixtureV3]] as const)('シードを守る（%s）', (_v, fx) => {
  it.each(fx.map((f) => [f.seed, f]))('%s', (_seed, f) => {
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
});

describe('シードの版', () => {
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

describe('第2版のシード', () => {
  it('第1版と同じ作り方で、最初の部屋の敵だけ弱い亡者になる', () => {
    for (let i = 0; i < 40; i++) {
      const seed = `2-hollow${i}`;
      const d = generateDungeon(seed, 30);
      const v1 = buildCatacomb(catacombFromSeed(seed), normalizeSeed(seed), 30);
      expect(d.floors[0][0].enemy!.name).toBe('亡者');
      expect(charLevel(d.floors[0][0].enemy!)).toBeLessThan(30);
      expect(d.floors[0][0].loot).toEqual(v1.floors[0][0].loot);
      // 主と2部屋目からはそのまま
      expect(d.floors.flat().slice(1)).toEqual(v1.floors.flat().slice(1));
      expect(rebuildDungeon(d.catacombId, d.seed, 30)).toEqual(d);
    }
  });
  it('新しく用意するシードは第3版（邪教徒の地下墓が増えた）', () => {
    expect(seedVersion(versionedSeed('x'))).toBe(3);
  });
});
