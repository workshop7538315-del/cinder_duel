import { describe, expect, it } from 'vitest';
import { allocTotal, charLevel, checkCharacter, drainedCopy, levelBudget, loseLevels, newCharacter } from '../src/character/model';
import { ABYSS, ABYSSES } from '../src/data/abyss';
import { CARDS } from '../src/data/cards';
import { RULES } from '../src/data/rules';
import { addCurse, drainLevel } from '../src/engine/fighter';
import { buildAbyss, rebuildDungeon } from '../src/dungeon/generate';
import { Battle, type BattleIO } from '../src/game/battle';
import { makeFighter } from '../src/game/setup';

describe('底の構成', () => {
  it('1階層3部屋。バジリスク2体（レベル+5）と盗掘者狩り（レベル+10）', () => {
    for (const key of Object.keys(ABYSSES)) {
      const d = buildAbyss(key, 'x', 30);
      expect(d.rank).toBe('底');
      expect(d.floors).toHaveLength(1);
      const [a, b, boss] = d.floors[0];
      expect([a.kind, b.kind, boss.kind]).toEqual(['battle', 'battle', 'boss']);
      expect(a.enemy!.name).toBe('バジリスク');
      expect(charLevel(a.enemy!)).toBe(30 + ABYSS.basiliskLevelBonus);
      expect(charLevel(boss.enemy!)).toBe(30 + ABYSS.hunterLevelBonus);
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
  it('レベルが下がると、いちばん高い能力値が1下がる', () => {
    const f = makeFighter(newCharacter('vagabond'), true);
    const lv = f.level;
    const k = drainLevel(f);
    expect(k).toBe('vit');
    expect(f.level).toBe(lv - 1);
    expect(f.drained).toBe(1);
  });
  it('探索中に下げられた分は、次の戦闘にも持ち越す（保存はしない）', () => {
    const c = newCharacter('vagabond');
    c.alloc.str = 10;
    const d = drainedCopy(c, 2);
    expect(charLevel(d)).toBe(charLevel(c) - 2);
    expect(c.alloc.str).toBe(10);
  });
});

describe('底から脱出したときのレベル喪失', () => {
  it('振った能力値の高いものから3レベル減り、振れる上限も3減る', () => {
    const c = newCharacter('vagabond');
    c.alloc.str = RULES.levelBudget;
    const after = loseLevels(c, ABYSS.escapeLevelLoss);
    expect(after.lostLevels).toBe(3);
    expect(levelBudget(after)).toBe(RULES.levelBudget - 3);
    expect(allocTotal(after.alloc)).toBe(RULES.levelBudget - 3);
    expect(charLevel(after)).toBe(charLevel(c) - 3);
    expect(checkCharacter(after).errors).toEqual([]);
  });
  it('まだ振り切っていなければ、能力値は減らず上限だけ減る', () => {
    const c = newCharacter('vagabond');
    c.alloc.str = 5;
    const after = loseLevels(c, 3);
    expect(after.alloc.str).toBe(5);
    expect(levelBudget(after)).toBe(RULES.levelBudget - 3);
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
