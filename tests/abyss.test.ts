import { describe, expect, it } from 'vitest';
import { allocTotal, charLevel, checkCharacter, levelBudget, loseLevels, newCharacter } from '../src/character/model';
import { ABYSS, ABYSS_KEYS, ABYSSES, SEA_KEY, SEAFLOOR } from '../src/data/abyss';
import { WEAPONS } from '../src/data/equipment';
import { sanitizeCharacter } from '../src/character/storage';
import { CARDS } from '../src/data/cards';
import { RULES } from '../src/data/rules';
import { addCurse } from '../src/engine/fighter';
import { abyssFromSeed, abyssSeed, buildAbyss, fixedFromSeed, pickAbyss, rebuildDungeon } from '../src/dungeon/generate';
import { Battle, type BattleIO } from '../src/game/battle';
import { makeFighter } from '../src/game/setup';

describe('底の構成', () => {
  it('1階層3部屋。バジリスク2体（基準+5）と盗掘者狩り（基準+10）。Lv80未満は基準がLv80', () => {
    for (const key of Object.keys(ABYSSES)) {
      const d = buildAbyss(key, 'x', 30);
      expect(d.rank).toBe('底');
      expect(d.floors).toHaveLength(1);
      const [a, b, boss] = d.floors[0];
      expect([a.kind, b.kind, boss.kind]).toEqual(['battle', 'battle', 'boss']);
      expect(a.enemy!.name).toBe('バジリスク');
      expect(charLevel(a.enemy!)).toBe(ABYSS.minBaseLevel + ABYSS.basiliskLevelBonus);
      expect(charLevel(boss.enemy!)).toBe(ABYSS.minBaseLevel + ABYSS.hunterLevelBonus);
      expect(boss.enemy!.name).toContain('盗掘者狩り');
      // 主は専用の物を必ず落とす
      expect(ABYSSES[key].loot.map((l) => l.id)).toContain(boss.loot!.id);
      expect(rebuildDungeon(d.catacombId, 'x', 30)).toEqual(d);
    }
  });
  it('専用の物は底ごとに3つ（杖・底の魔術・捨てると発動する道具）', () => {
    for (const a of Object.values(ABYSSES)) {
      expect(a.loot).toHaveLength(3);
      const [staff, spell, item] = a.loot;
      expect(staff.kind).toBe('item');
      expect(CARDS[spell.id].discard).toBeTruthy();
      expect(CARDS[item.id].onDiscard).toBeTruthy();
      expect(CARDS[item.id].unplayable).toBe(true);
    }
  });
  it('Lv80以上なら、基準は自分のレベル', () => {
    const d = buildAbyss('earth', 'x', 95);
    expect(charLevel(d.floors[0][0].enemy!)).toBe(95 + ABYSS.basiliskLevelBonus);
    expect(charLevel(d.floors[0][2].enemy!)).toBe(95 + ABYSS.hunterLevelBonus);
    const sea = buildAbyss(SEA_KEY, 'x', 95);
    expect(charLevel(sea.floors[1][3].enemy!)).toBe(95 + 12);
  });
  it('ソウル稼ぎには向かない', () => {
    const d = buildAbyss('earth', 'x', 30);
    const total = d.floors[0].reduce((a, r) => a + r.souls, 0);
    expect(total).toBeLessThan(1000);
  });
});

describe('呪死とレベル低下', () => {
  it('呪死が溜まりきると即死', () => {
    const f = makeFighter(newCharacter('vagabond'), true);
    expect(addCurse(f, RULES.curseThreshold - 1)).toBe(false);
    expect(addCurse(f, 1)).toBe(true);
  });
  it('レベルを奪う攻撃で呪死したときだけ、レベルを失う（当たっただけでは下がらない）', async () => {
    const io = {
      log: () => {}, update: () => {}, flash: () => {}, wait: () => Promise.resolve(),
      askReactDice: async () => 0, askReactChoice: async () => 'take' as const, finished: () => {},
    } as unknown as BattleIO;
    const b = new Battle(makeFighter(newCharacter('vagabond'), true), makeFighter(newCharacter('wretch'), false), io);
    const lv = b.p.level;
    await b.strike(b.e, b.p, { label: '呪いの息', dmg: 1, type: 'magic', curse: 7, drain: true });
    expect(b.p.drained ?? 0).toBe(0);
    expect(b.p.level).toBe(lv);
    await b.strike(b.e, b.p, { label: '呪いの息', dmg: 1, type: 'magic', curse: 7, drain: true });
    expect(b.p.hp).toBe(0);
    expect(b.p.drained).toBe(1);
  });
});

describe('底から脱出したときのレベル喪失', () => {
  it('振った能力値の高いものから3レベル減り、振れる上限も3減る', () => {
    const c = { ...newCharacter('vagabond'), freeLevels: RULES.legacyFreeLevels };
    c.alloc.str = RULES.legacyFreeLevels;
    const after = loseLevels(c, ABYSS.escapeLevelLoss);
    expect(after.lostLevels).toBe(3);
    expect(levelBudget(after)).toBe(RULES.legacyFreeLevels - 3);
    expect(allocTotal(after.alloc)).toBe(RULES.legacyFreeLevels - 3);
    expect(charLevel(after)).toBe(charLevel(c) - 3);
    expect(checkCharacter(after).errors).toEqual([]);
  });
  it('まだ振り切っていなければ、能力値は減らず上限だけ減る', () => {
    const c = { ...newCharacter('vagabond'), freeLevels: RULES.legacyFreeLevels };
    c.alloc.str = 5;
    const after = loseLevels(c, 3);
    expect(after.alloc.str).toBe(5);
    expect(levelBudget(after)).toBe(RULES.legacyFreeLevels - 3);
  });
});

describe('捨てて使う魔術と、捨てられると発動する道具', () => {
  function setup(hand: string[]) {
    const logs: string[] = [];
    let picked: number[] = [];
    const io = {
      log: (t: string) => logs.push(t), update: () => {}, flash: () => {}, wait: () => Promise.resolve(),
      askReactDice: async () => 0, askReactChoice: async () => 'take' as const,
      askDiscard: async (h: string[], min: number) => (picked = h.map((_, i) => i).filter((i) => h[i] !== 'quake').slice(0, Math.max(min, 2))),
    } as unknown as BattleIO;
    const c = newCharacter('astrologer');
    c.alloc.int = 10;
    c.equip.left = 'deep_staff';
    c.alloc.str = 4;
    const b = new Battle(makeFighter(c, true), makeFighter(newCharacter('wretch'), false), io);
    b.p.hand = [...hand];
    b.p.fp = 30;
    return { b, logs, picked: () => picked };
  }
  it('地鳴り: 選んで捨て、捨てた枚数で威力が上がる。化石は捨てられると発動する', async () => {
    const { b, logs } = setup(['quake', 'fossil', 'kick']);
    const hp = b.e.hp;
    await b.playCard(b.p, b.e, 0, [{ id: 1, v: 6 }]);
    expect(b.p.hand).toEqual([]);
    expect(b.p.discard).toEqual(expect.arrayContaining(['quake', 'fossil', 'kick']));
    expect(logs.some((l) => l.includes('「割れた化石」が発動'))).toBe(true);
    expect(b.e.hp).toBeLessThan(hp - 10);
  });
  it('捨てる手札が足りないと使えない。道具は自分では使えない', async () => {
    const { b } = setup(['quake']);
    const { cardUnusable } = await import('../src/game/battle');
    expect(cardUnusable(b.p, 'quake')).toMatch(/捨てる手札/);
    expect(cardUnusable(b.p, 'fossil')).toMatch(/捨てられたとき/);
  });
});

describe('海底', () => {
  it('間取りと宝は固定で、敵のレベルは入ったときのレベル＋固定値', () => {
    const a = buildAbyss(SEA_KEY, 'a', 30);
    const b = buildAbyss(SEA_KEY, 'b', 30);
    expect(a.rank).toBe('底');
    expect(a.catacombId).toBe('abyss:sea');
    expect(a.floors.map((f) => f.map((r) => r.kind))).toEqual(b.floors.map((f) => f.map((r) => r.kind)));
    expect(a.floors.flat().map((r) => r.loot?.id ?? null)).toEqual(b.floors.flat().map((r) => r.loot?.id ?? null));
    a.floors.forEach((f, fi) => f.forEach((r, ri) => {
      const def = SEAFLOOR.floors[fi][ri];
      if (def.kind === 'battle' || def.kind === 'boss') expect(charLevel(r.enemy!)).toBe(ABYSS.minBaseLevel + def.bonus);
    }));
    // 各階層の最後の戦闘は主、最後の主は専用の触媒武器を落とす
    const last = a.floors[a.floors.length - 1];
    expect(last[last.length - 1].kind).toBe('boss');
    expect(last[last.length - 1].loot!.id).toBe('sea_harpoon');
    expect(rebuildDungeon(a.catacombId, 'a', 30)).toEqual(a);
  });
  it('専用の物は3つ（触媒武器・捨てて使う魔術・捨てると発動する道具）', () => {
    const [w, spell, item] = SEAFLOOR.loot;
    expect(WEAPONS[w.id].school).toBe('sorcery');
    expect(CARDS[spell.id].discard).toBeTruthy();
    expect(CARDS[item.id].onDiscard).toBeTruthy();
    // すべて海底のどこかで手に入る
    const got = buildAbyss(SEA_KEY, 'x', 30).floors.flat().map((r) => r.loot?.id);
    for (const l of SEAFLOOR.loot) expect(got).toContain(l.id);
  });
  it('底に落ちるとき、まれに海底になる', () => {
    expect(pickAbyss(() => ABYSS.seaChance - 0.001)).toBe(SEA_KEY);
    expect(Object.keys(ABYSSES)).toContain(pickAbyss(() => ABYSS.seaChance));
  });
});

describe('踏破した底への直通', () => {
  it('底ごとに直通のシードがあり、ほかのシードと重ならない', () => {
    const seeds = ABYSS_KEYS.map((k) => abyssSeed(k));
    expect(new Set(seeds).size).toBe(ABYSS_KEYS.length);
    for (const k of ABYSS_KEYS) {
      expect(abyssFromSeed(abyssSeed(k)!.toUpperCase())).toBe(k);
      expect(fixedFromSeed(abyssSeed(k)!)).toBeNull();
    }
    expect(abyssFromSeed('1-abcdefgh')).toBeNull();
  });
  it('踏破した底は保存される（知らないキーは捨てる）', () => {
    const c = { ...newCharacter('vagabond'), abyssCleared: ['earth', 'sea', 'nope'] };
    const back = sanitizeCharacter(JSON.parse(JSON.stringify(c)))!;
    expect(back.abyssCleared).toEqual(['earth', 'sea']);
  });
});
