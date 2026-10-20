import { describe, expect, it } from 'vitest';
import { loadout, newCharacter } from '../src/character/model';
import { CARDS } from '../src/data/cards';
import { CATACOMBS } from '../src/data/catacombs';
import { WEAPONS } from '../src/data/equipment';
import { spellPower } from '../src/engine/fighter';
import { buildCatacomb } from '../src/dungeon/generate';
import { Battle, type BattleIO } from '../src/game/battle';
import { patternTurn } from '../src/game/pattern';
import { makeFighter } from '../src/game/setup';

const CULT = ['abyss_offering', 'abyss_whisper', 'sinking_prayer', 'bottomless_craving', 'black_tide'];
const io = { log: () => {}, update: () => {}, flash: () => {}, wait: () => Promise.resolve(), finished: () => {} } as unknown as BattleIO;

const cultist = () => {
  const c = newCharacter('astrologer');
  c.freeLevels = 30;
  c.alloc = { ...c.alloc, int: 14, dex: 4 };
  c.equip.left = 'cult_seal';
  return c;
};

describe('邪教の祈祷', () => {
  it('知力で使う祈祷で、使うときに捨て、捨てられても発動する', () => {
    for (const id of CULT) {
      const c = CARDS[id];
      expect(c.kind).toBe('祈祷');
      expect(c.school).toBe('incant');
      expect(c.req?.int).toBeGreaterThan(0);
      expect(c.req?.fai).toBeUndefined();
      expect(c.discard).toBeTruthy();
      expect(c.onDiscard).toBeTruthy();
      expect(c.unplayable).toBeFalsy();
    }
  });
  it('邪教の聖印は祈祷の触媒で、知力で威力が伸びる', () => {
    expect(WEAPONS.cult_seal.school).toBe('incant');
    expect(WEAPONS.cult_seal.req.int).toBeGreaterThan(0);
    const low = makeFighter(cultist(), true);
    const hi = cultist();
    hi.alloc.int += 10;
    expect(spellPower(makeFighter(hi, true), 'incant')!).toBeGreaterThan(spellPower(low, 'incant')!);
  });
  it('邪教の祈祷で邪教の祈祷を捨てると、捨てた方も発動する', async () => {
    const p = makeFighter(cultist(), true);
    const e = makeFighter(newCharacter('wretch'), false);
    const b = new Battle(p, e, { ...io, askDiscard: async () => [0], askReactDice: async () => 0 } as unknown as BattleIO);
    p.hand = ['abyss_whisper', 'abyss_whisper'];
    p.action = [{ id: 1, v: 6 }];
    p.fp = 20;
    const hp = e.hp;
    await b.playCard(p, e, 0, [p.action[0]]);
    // 囁き本体＋捨てた囁きの残響（リアクション不可）の2回当たる
    expect(e.hp).toBeLessThan(hp - 5);
    expect(p.discard).toContain('abyss_whisper');
  });
});

describe('邪教徒の地下墓', () => {
  it('邪教徒は邪教の祈祷を持ち、大司祭は第二形態のある主', () => {
    expect(CATACOMBS.cult.levelOffset!.enemy).toBeGreaterThan(0);
    const d = buildCatacomb('cult', 'c', 40);
    const foes = d.floors.flat().filter((r) => r.enemy);
    const cultistFoe = foes.find((r) => r.enemy!.name === '邪教徒');
    if (cultistFoe) expect(cultistFoe.enemy!.deck.some((id) => CULT.includes(id))).toBe(true);
    const boss = d.floors.at(-1)!.at(-1)!;
    expect(boss.enemy!.name).toBe('淵の大司祭');
    expect(boss.enemy!.foeRank).toBe('主');
    expect(boss.enemy!.behavior!.phase2).toBeTruthy();
    expect(loadout(boss.enemy!).schools).toContain('incant');
  });
  it('大司祭の祈祷は、捨てた枚数ぶん強くなる', async () => {
    const d = buildCatacomb('cult', 'c', 40);
    const boss = makeFighter(d.floors.at(-1)!.at(-1)!.enemy!, false);
    const p = makeFighter(newCharacter('vagabond'), true);
    const b = new Battle(p, boss, io);
    const dmg: number[] = [];
    b.strike = async (_a, _d, atk) => { dmg.push(atk.dmg); };
    boss.pattern!.behavior = { mode: 'cycle', dodge: 0, guard: 0, moves: [
      { name: 'a', card: 'abyss_whisper', discarded: 0 }, { name: 'b', card: 'abyss_whisper', discarded: 2 }] };
    boss.pattern!.next = 0;
    await patternTurn(b, boss, p);
    await patternTurn(b, boss, p);
    expect(dmg[1] - dmg[0]).toBe(10);
  });
});

describe('ランダムに捨てる・邪教のフード', () => {
  const setup = (hood: boolean, count: number) => {
    const c = cultist();
    if (hood) { c.inventory.items.push('cult_hood'); c.equip.head = 'cult_hood'; }
    const p = makeFighter(c, true);
    const e = makeFighter(newCharacter('wretch'), false);
    let asked = 0;
    const b = new Battle(p, e, {
      ...io, askReactDice: async () => 0,
      askDiscard: async () => { throw new Error('選ばせない'); },
      askDiscardCount: async (min: number, max: number) => { asked++; expect([min, max]).toEqual([1, 3]); return count; },
    } as unknown as BattleIO);
    return { b, p, e, asked: () => asked };
  };
  it('枚数だけ選び、捨てるカードは手札からランダム', async () => {
    const { b, p, e, asked } = setup(false, 2);
    p.hand = ['bottomless_craving', 'kick', 'stance', 'breath', 'oil'];
    p.deck = [];
    p.action = [{ id: 1, v: 6 }];
    p.fp = 30;
    await b.playCard(p, e, 0, [p.action[0]]);
    expect(asked()).toBe(1);
    expect(p.hand).toHaveLength(2);
    expect(p.discard.filter((id) => id !== 'bottomless_craving')).toHaveLength(2);
  });
  it('邪教のフード: カードの効果で手札を捨てたら1枚引く', async () => {
    expect(loadout({ ...cultist(), equip: { ...cultist().equip, head: 'cult_hood' } }).acc.drawOnDiscard).toBe(1);
    const { b, p, e } = setup(true, 2);
    p.hand = ['bottomless_craving', 'kick', 'stance', 'breath', 'oil'];
    p.deck = ['insight', 'insight'];
    p.action = [{ id: 1, v: 6 }];
    p.fp = 30;
    await b.playCard(p, e, 0, [p.action[0]]);
    expect(p.hand).toHaveLength(3);
    expect(p.hand).toContain('insight');
  });
  it('邪教徒の地下墓では、邪教のフードがまれに手に入る', () => {
    let found = 0;
    for (let i = 0; i < 60; i++) {
      const d = buildCatacomb('cult', `h${i}`, 40);
      if (d.floors.flat().some((r) => r.bonus?.id === 'cult_hood')) found++;
      // ほかの地下墓では出ない
      expect(buildCatacomb('knight', `h${i}`, 40).floors.flat().some((r) => r.bonus)).toBe(false);
    }
    expect(found).toBeGreaterThan(10);
  });
});
