import { describe, expect, it } from 'vitest';
import { checkCharacter, newCharacter } from '../src/character/model';
import { CATACOMBS, DUNGEON } from '../src/data/catacombs';
import { CARDS } from '../src/data/cards';
import { ARMORS, SHIELDS, WEAPONS } from '../src/data/equipment';
import { buildCatacomb, catacombFromSeed, generateDungeon } from '../src/dungeon/generate';
import { seededRng } from '../src/dungeon/rng';
import { bankRun, currentRoom, leaveBonfire, loseBattle, openChest, retreat, startRun, winBattle } from '../src/dungeon/run';

const seeds = Array.from({ length: 200 }, (_, i) => `s${i}`);

describe('乱数', () => {
  it('同じシードなら同じ乱数列', () => {
    const a = seededRng('abc');
    const b = seededRng('abc');
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(seededRng('abd')()).not.toBe(seededRng('abc')());
  });
});

describe('地下墓の生成', () => {
  it('データの装備・カードはすべて実在する', () => {
    for (const cat of Object.values(CATACOMBS)) {
      for (const l of cat.loot) {
        if (l.kind === 'card') expect(CARDS[l.id], l.id).toBeTruthy();
        else expect(WEAPONS[l.id] || SHIELDS[l.id] || ARMORS[l.id], l.id).toBeTruthy();
      }
    }
  });
  it('1〜3階層、各3〜5部屋。最後は主、途中の階層の最後は篝火', () => {
    for (const id of Object.keys(CATACOMBS)) {
      for (const s of seeds.slice(0, 40)) {
        const d = buildCatacomb(id, s, 30);
        expect(d.floors.length).toBeGreaterThanOrEqual(DUNGEON.floorsMin);
        expect(d.floors.length).toBeLessThanOrEqual(DUNGEON.floorsMax);
        d.floors.forEach((f, fi) => {
          expect(f.length).toBeGreaterThanOrEqual(DUNGEON.roomsMin);
          expect(f.length).toBeLessThanOrEqual(DUNGEON.roomsMax);
          expect(f[0].kind).toBe('battle');
          expect(f[f.length - 1].kind).toBe(fi === d.floors.length - 1 ? 'boss' : 'bonfire');
        });
      }
    }
  });
  it('同じ地下墓・シード・レベルなら同じ中身', () => {
    expect(generateDungeon('hello', 25)).toEqual(generateDungeon('hello', 25));
    expect(generateDungeon(' HELLO ', 25)).toEqual(generateDungeon('hello', 25));
    expect(generateDungeon('hello', 25)).not.toEqual(generateDungeon('hellp', 25));
  });
  it('シードでどの地下墓かが決まり、6種類すべてに行ける', () => {
    expect(generateDungeon('abc', 30).catacombId).toBe(catacombFromSeed('abc'));
    const seen = new Set(seeds.map(catacombFromSeed));
    expect([...seen].sort()).toEqual(Object.keys(CATACOMBS).sort());
  });
  it('長い地下墓ほど良いものが出やすい', () => {
    const avg = (pred: (n: number) => boolean) => {
      const tiers: number[] = [];
      for (const s of seeds) {
        const d = buildCatacomb('knight', s, 30);
        if (!pred(d.totalRooms)) continue;
        for (const f of d.floors) for (const r of f) if (r.loot) tiers.push(r.loot.tier);
      }
      return tiers.reduce((a, b) => a + b, 0) / tiers.length;
    };
    expect(avg((n) => n >= 10)).toBeGreaterThan(avg((n) => n <= 5));
  });
  it('敵はちゃんと戦える状態', () => {
    const d = buildCatacomb('cleric', 'x', 20);
    for (const f of d.floors) for (const r of f) if (r.enemy) expect(checkCharacter(r.enemy, { ignoreBudget: true }).errors).toEqual([]);
  });
});

describe('探索の進み方', () => {
  const d = buildCatacomb('samurai', 'walk', 30);
  const walk = () => {
    let run = startRun('c1', d);
    for (let guard = 0; guard < 50 && run.status === 'active'; guard++) {
      const room = currentRoom(d, run)!;
      if (room.kind === 'chest') run = openChest(d, run);
      else if (room.kind === 'bonfire') run = leaveBonfire(d, run);
      else run = winBattle(d, run, 10, 5);
    }
    return run;
  };
  it('最後まで勝てば踏破。踏破ボーナスつき', () => {
    const run = walk();
    expect(run.status).toBe('cleared');
    const fromRooms = d.floors.flat().reduce((a, r) => a + r.souls, 0);
    expect(run.souls).toBe(fromRooms + d.totalRooms * DUNGEON.clearBonusPerRoom);
  });
  it('死ぬと何も持ち帰れない。退却なら持ち帰れる', () => {
    const c = newCharacter('samurai');
    const run = { ...walk(), status: 'active' as const };
    expect(bankRun(c, loseBattle(run)).character).toBe(c);
    const { character, banked } = bankRun(c, retreat(run));
    expect(character.souls).toBe(banked.souls);
    expect(banked.souls).toBeGreaterThanOrEqual(run.souls);
  });
  it('持っている装備はソウルに替わり、カードは枚数が増える', () => {
    const c = newCharacter('samurai');
    const run = { ...startRun(c.id, d), status: 'cleared' as const, souls: 0,
      loot: [{ kind: 'item' as const, id: 'katana', tier: 3 as const }, { kind: 'item' as const, id: 'dagger', tier: 2 as const }, { kind: 'card' as const, id: 'kick', tier: 1 as const }] };
    const { character, banked } = bankRun(c, run);
    expect(banked.dupes).toEqual(['katana']);
    expect(banked.items).toEqual(['dagger']);
    expect(character.inventory.items).toContain('dagger');
    expect(character.inventory.cards.kick).toBe((c.inventory.cards.kick ?? 0) + 1);
    expect(character.souls).toBe(3 * DUNGEON.dupeSouls);
  });
});
