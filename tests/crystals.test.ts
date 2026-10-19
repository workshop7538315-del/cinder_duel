import { describe, expect, it } from 'vitest';
import { loadout, newCharacter, type Character } from '../src/character/model';
import { parseSave, sanitizeCharacter, SAVE_VERSION, serializeSave } from '../src/character/storage';
import { DEEP } from '../src/data/abyss';
import { CRYSTAL_KEYS, CRYSTAL_KINDS, CRYSTAL_TENDENCY, rollCrystal, rollCursedCrystal } from '../src/data/crystals';
import { WEAPONS } from '../src/data/equipment';
import { seededRng } from '../src/dungeon/rng';
import { buildAbyss, buildDeep, deepTarget, rebuildDungeon } from '../src/dungeon/generate';
import { bankRun, startRun } from '../src/dungeon/run';
import { Battle, type BattleIO } from '../src/game/battle';
import { makeFighter } from '../src/game/setup';
import type { Crystal } from '../src/engine/types';

const holder = (crystals: Crystal[], equipped = true): Character => {
  const c = newCharacter('astrologer');
  c.alloc = { ...c.alloc, str: 10, int: 10 };
  c.freeLevels = 30;
  c.inventory.items.push('lake_spear');
  c.inventory.crystals = crystals;
  c.sockets = { lake_spear: crystals.map((x) => x.uid) };
  if (equipped) c.equip.right = 'lake_spear';
  return c;
};
const cr = (uid: string, plus: Crystal['plus'], minus?: Crystal['minus']): Crystal => ({ uid, name: 'x', plus, ...(minus ? { minus } : {}) });

describe('淵結晶の効果', () => {
  it('はめた武器を持っているときだけ効く。マイナスは引く', () => {
    const list = [cr('a', { key: 'hp', value: 0.1 }), cr('b', { key: 'fp', value: 4 }, { key: 'cut', value: 0.05 })];
    const base = loadout(holder([], true));
    const on = loadout(holder(list, true));
    const off = loadout(holder(list, false));
    expect(on.derived.maxHp).toBe(Math.floor(base.derived.maxHp * 1.1));
    expect(on.derived.maxFp).toBe(base.derived.maxFp + 4);
    expect(on.armorCut.phys).toBeCloseTo(Math.max(0, base.armorCut.phys - 0.05));
    expect(off.crystals).toEqual([]);
  });
  it('武器攻撃のダメージ・出血・呪死が増える', async () => {
    const list = [cr('a', { key: 'atk', value: 0.5 }), cr('b', { key: 'bleed', value: 4 }), cr('c', { key: 'curse', value: 2 })];
    const hits: { dmg: number; bleed?: number; curse?: number }[] = [];
    const io = { log: () => {}, update: () => {}, flash: () => {}, wait: () => Promise.resolve(), finished: () => {} } as unknown as BattleIO;
    for (const l of [[], list]) {
      const b = new Battle(makeFighter(holder(l), true), makeFighter(newCharacter('wretch'), false), io);
      b.strike = async (_f, _o, atk) => { hits.push(atk); };
      await b.weaponAttack(b.p, b.e);
    }
    expect(hits[1].dmg).toBe(Math.round(hits[0].dmg * 1.5));
    expect(hits[1].bleed).toBe((hits[0].bleed ?? 0) + 4);
    expect(hits[1].curse).toBe((hits[0].curse ?? 0) + 2);
  });
});

describe('淵結晶の出方', () => {
  it('値は決めた幅に収まり、底ごとに出やすい種類がある', () => {
    const r = seededRng('t');
    for (let i = 0; i < 300; i++) {
      const x = rollCrystal(r, 'earth');
      const [lo, hi] = CRYSTAL_KINDS[x.plus.key].plus;
      expect(x.plus.value).toBeGreaterThanOrEqual(lo);
      expect(x.plus.value).toBeLessThanOrEqual(hi);
      expect(x.minus).toBeUndefined();
    }
    for (const [abyss, w] of Object.entries(CRYSTAL_TENDENCY)) {
      const top = Object.entries(w).sort((a, b) => b[1] - a[1])[0][0];
      const count: Record<string, number> = {};
      for (let i = 0; i < 2000; i++) { const k = rollCrystal(r, abyss).plus.key; count[k] = (count[k] ?? 0) + 1; }
      const most = Object.entries(count).sort((a, b) => b[1] - a[1])[0][0];
      expect(most, abyss).toBe(top);
    }
  });
  it('呪われた淵結晶はプラスが大きく、マイナスは別のもの', () => {
    const r = seededRng('c');
    for (const key of CRYSTAL_KEYS) for (let i = 0; i < 30; i++) {
      const x = rollCursedCrystal(r, key);
      expect(x.plus.key).toBe(key);
      expect(x.plus.value).toBeGreaterThanOrEqual(CRYSTAL_KINDS[key].cursed[0]);
      expect(x.minus).toBeTruthy();
      expect(x.minus!.key).not.toBe(key);
      expect(CRYSTAL_KINDS[x.minus!.key].minus).toBeTruthy();
    }
  });
  it('底の主は必ず淵結晶を落とす', () => {
    for (const key of ['earth', 'hull', 'gorge', 'lake']) {
      const d = buildAbyss(key, 'x', 30);
      expect(d.floors[0][2].extra?.kind).toBe('crystal');
    }
    const sea = buildAbyss('sea', 'x', 30);
    for (const f of sea.floors) for (const r of f) if (r.kind === 'boss') expect(r.extra?.kind).toBe('crystal');
  });
});

describe('深海', () => {
  it('間取り・敵と、強める対象はシードで決まる。強さとマイナスは潜るたびに変わる', () => {
    const a = buildDeep('1-abc', 40, 's1');
    const b = buildDeep('1-abc', 40, 's2');
    expect(a.floors.map((f) => f.map((r) => [r.kind, r.enemy?.name]))).toEqual(b.floors.map((f) => f.map((r) => [r.kind, r.enemy?.name])));
    const cs = (d: typeof a) => d.floors.flat().map((r) => r.extra?.crystal).filter((x): x is Crystal => !!x);
    for (const x of [...cs(a), ...cs(b)]) {
      expect(x.plus.key).toBe(deepTarget('1-abc'));
      expect(x.minus).toBeTruthy();
    }
    expect(cs(a)).not.toEqual(cs(b));
    expect(rebuildDungeon(a.catacombId, a.seed, 40, 1, 's1')).toEqual(a);
    expect(a.rank).toBe('底');
    // 主は必ず落とす
    expect(a.floors.at(-1)!.at(-1)!.extra?.kind).toBe('crystal');
    expect(a.floors.length).toBeGreaterThanOrEqual(DEEP.floorsMin);
  });
  it('シードによって強める対象が変わる', () => {
    const keys = new Set(Array.from({ length: 60 }, (_, i) => deepTarget(`s${i}`)));
    expect(keys.size).toBeGreaterThan(5);
  });
});

describe('持ち帰りと保存', () => {
  it('持ち帰った淵結晶には一つずつ別の uid がつく', () => {
    const c = newCharacter('vagabond');
    const d = buildAbyss('earth', 'x', 30);
    const x = d.floors[0][2].extra!;
    const run = { ...startRun(c.id, d), status: 'cleared' as const, loot: [x, x] };
    const { character, banked } = bankRun(c, run);
    expect(banked.crystals).toHaveLength(2);
    expect(banked.crystals[0].uid).not.toBe(banked.crystals[1].uid);
    expect(character.inventory.crystals).toHaveLength(2);
  });
  it('はめた淵結晶は保存され、持っていない・重複・はめられない武器は外れる', () => {
    const list = [cr('a', { key: 'hp', value: 0.1 }), cr('b', { key: 'atk', value: 0.2 }, { key: 'fp', value: 3 })];
    const c = holder(list);
    c.sockets = { lake_spear: ['a', 'b', 'zzz'], longsword: ['a'] };
    const back = sanitizeCharacter(JSON.parse(JSON.stringify(c)))!;
    expect(back.inventory.crystals).toEqual(list);
    expect(back.sockets).toEqual({ lake_spear: ['a', 'b', null] });
    expect(WEAPONS.longsword.sockets).toBeUndefined();
    const again = parseSave(serializeSave({ version: SAVE_VERSION, characters: [back] })).characters[0];
    expect(again.sockets).toEqual(back.sockets);
  });
});
