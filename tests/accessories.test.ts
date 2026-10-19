import { describe, expect, it } from 'vitest';
import { charLevel, checkCharacter, loadout, newCharacter } from '../src/character/model';
import { parseSave, sanitizeCharacter } from '../src/character/storage';
import { ACCESSORIES, CATACOMB_ACCESSORIES } from '../src/data/accessories';
import { CATACOMBS, DUNGEON } from '../src/data/catacombs';
import { RULES } from '../src/data/rules';
import { guardCost } from '../src/engine/fighter';
import { generateDungeon, rebuildDungeon } from '../src/dungeon/generate';
import { openChest, startRun, winBattle } from '../src/dungeon/run';
import { makeFighter } from '../src/game/setup';

const withAcc = (ids: string[]) => {
  const c = newCharacter('vagabond');
  c.inventory.items.push(...ids);
  c.accessories = ids;
  return c;
};

describe('アクセサリ（指輪・タリスマン）', () => {
  it('能力値の上乗せは補正に効くが、レベルには数えない', () => {
    const c = withAcc(['might_talisman']);
    const base = loadout(newCharacter('vagabond'));
    expect(loadout(c).stats.str).toBe(base.stats.str + 5);
    expect(loadout(c).level).toBe(base.level);
    expect(charLevel(c)).toBe(charLevel(newCharacter('vagabond')));
  });
  it('HP・FP・スタミナ・カット・重さに効く', () => {
    const base = loadout(newCharacter('vagabond'));
    const lo = loadout(withAcc(['life_ring', 'mind_talisman', 'breath_talisman', 'iron_ring']));
    expect(lo.derived.maxHp).toBe(Math.floor(base.derived.maxHp * 1.1));
    expect(lo.derived.maxFp).toBe(base.derived.maxFp + 5);
    expect(lo.derived.stInit).toBe(Math.min(base.derived.stMax, base.derived.stInit + 1));
    expect(lo.armorCut.phys).toBeCloseTo(base.armorCut.phys + 0.1);
    expect(lo.weight).toBeCloseTo(base.weight + 0.5 + 0.5 + 0.6 + 0.5);
  });
  it('ガード消費が軽くなる', () => {
    const a = makeFighter(newCharacter('vagabond'), true);
    const b = makeFighter(withAcc(['shield_talisman']), true);
    expect(guardCost(b, 30)).toBe(Math.max(1, guardCost(a, 30) - 1));
  });
  it(`${RULES.accessorySlots}つまで、同じものは1つ、持っているものだけ`, () => {
    expect(checkCharacter(withAcc(['iron_ring', 'life_ring', 'star_ring', 'blood_ring'])).errors).toEqual([]);
    expect(checkCharacter(withAcc(['iron_ring', 'life_ring', 'star_ring', 'blood_ring', 'prayer_ring'])).errors.length).toBeGreaterThan(0);
    const dup = withAcc(['iron_ring']);
    dup.accessories = ['iron_ring', 'iron_ring'];
    expect(checkCharacter(dup).errors.length).toBeGreaterThan(0);
    const notOwned = newCharacter('vagabond');
    notOwned.accessories = ['iron_ring'];
    expect(checkCharacter(notOwned).errors.length).toBeGreaterThan(0);
  });
  it('指輪とタリスマンがあり、どの地下墓のアクセサリも存在する', () => {
    const kinds = new Set(Object.values(ACCESSORIES).map((a) => a.kind));
    expect(kinds).toEqual(new Set(['指輪', 'タリスマン']));
    for (const [k, ids] of Object.entries(CATACOMB_ACCESSORIES)) {
      expect(CATACOMBS[k]).toBeTruthy();
      for (const id of ids) expect(ACCESSORIES[id]).toBeTruthy();
    }
  });
  it('保存して読み込める。v3 のセーブはアクセサリなしで読める', () => {
    const c = withAcc(['iron_ring']);
    c.cycles = { knight: 2 };
    const back = sanitizeCharacter(JSON.parse(JSON.stringify(c)))!;
    expect(back.accessories).toEqual(['iron_ring']);
    expect(back.cycles).toEqual({ knight: 2 });
    const { accessories: _a, cycles: _c, ...old } = newCharacter('samurai');
    const v3 = parseSave(JSON.stringify({ version: 3, characters: [old] })).characters[0];
    expect(v3.accessories).toEqual([]);
    expect(v3.cycles).toEqual({});
  });
});

describe('周回', () => {
  it('2周目は同じ間取り・敵・宝で、敵のレベルが上がる。1周目は変わらない', () => {
    for (let i = 0; i < 20; i++) {
      const seed = `2-cyc${i}`;
      const one = generateDungeon(seed, 30);
      const two = generateDungeon(seed, 30, 2);
      expect(generateDungeon(seed, 30, 1)).toEqual(one);
      expect(two.catacombId).toBe(one.catacombId);
      expect(two.cycle).toBe(2);
      expect(two.level).toBe(30);
      expect(two.floors.map((f) => f.map((r) => [r.kind, r.loot, r.enemy?.name]))).toEqual(one.floors.map((f) => f.map((r) => [r.kind, r.loot, r.enemy?.name])));
      const lv = (d: typeof one) => d.floors.flat().filter((r) => r.enemy).map((r) => charLevel(r.enemy!));
      lv(two).forEach((l, j) => expect(l).toBeGreaterThanOrEqual(lv(one)[j]));
      expect(charLevel(two.floors.at(-1)!.at(-1)!.enemy!)).toBe(charLevel(one.floors.at(-1)!.at(-1)!.enemy!) + DUNGEON.cycleLevelStep);
      // 1周目はアクセサリなし、2周目は地下墓の主が必ずその地下墓のアクセサリを落とす
      expect(one.floors.flat().some((r) => r.extra)).toBe(false);
      const extra = two.floors.at(-1)!.at(-1)!.extra!;
      expect(CATACOMB_ACCESSORIES[two.catacombId]).toContain(extra.id);
      expect(rebuildDungeon(two.catacombId, seed, 30, 2)).toEqual(two);
    }
  });
  it('追加の落とし物も拾える（一度きり）', () => {
    for (let i = 0; i < 40; i++) {
      const d = generateDungeon(`2-x${i}`, 30, 2);
      const fi = d.floors.length - 1;
      const ri = d.floors[fi].length - 1;
      const run = { ...startRun('c', d), floor: fi, room: ri };
      const won = winBattle(d, run, 10, 1);
      expect(won.loot.map((l) => l.id)).toContain(d.floors[fi][ri].extra!.id);
      const chestAt = d.floors.flat().findIndex((r) => r.kind === 'chest' && r.extra);
      if (chestAt < 0) continue;
      let f = 0, r = chestAt;
      while (r >= d.floors[f].length) r -= d.floors[f++].length;
      const opened = openChest(d, { ...startRun('c', d), floor: f, room: r });
      expect(opened.loot.map((l) => l.id)).toContain(d.floors[f][r].extra!.id);
      return;
    }
  });
});
