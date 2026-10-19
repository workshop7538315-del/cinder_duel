import { describe, expect, it } from 'vitest';
import { charLevel, checkCharacter, newCharacter } from '../src/character/model';
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
  it('1〜3階層、各3〜5部屋。各階層の最後は主で、途中の階層は主のあとに篝火', () => {
    for (const id of Object.keys(CATACOMBS)) {
      for (const s of seeds.slice(0, 40)) {
        const d = buildCatacomb(id, s, 30);
        expect(d.floors.length).toBeGreaterThanOrEqual(DUNGEON.floorsMin);
        expect(d.floors.length).toBeLessThanOrEqual(DUNGEON.floorsMax);
        d.floors.forEach((f, fi) => {
          expect(f.length).toBeGreaterThanOrEqual(DUNGEON.roomsMin);
          expect(f.length).toBeLessThanOrEqual(DUNGEON.roomsMax);
          expect(f[0].kind).toBe('battle');
          const last = fi === d.floors.length - 1;
          expect(f[f.length - 1].kind).toBe(last ? 'boss' : 'bonfire');
          if (!last) expect(f[f.length - 2].kind).toBe('boss');
          expect(f.filter((r) => r.kind === 'boss')).toHaveLength(1);
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

import { abandon, isLooted, retrieveStain, stainHere } from '../src/dungeon/run';

describe('血痕（倒れたときのソウル）', () => {
  const d = buildCatacomb('knight', 'stain', 30);
  /** 最初の戦闘に勝ってソウルを持った状態で、次の戦闘部屋まで進める */
  function toSecondBattle() {
    let run = startRun('c1', d);
    run = winBattle(d, run, 50, 5);
    while (currentRoom(d, run)!.kind !== 'battle' && currentRoom(d, run)!.kind !== 'boss') {
      run = currentRoom(d, run)!.kind === 'chest' ? openChest(d, run) : leaveBonfire(d, run);
    }
    return run;
  }

  it('倒れるとソウルをその部屋に落とし、最初の部屋からやり直す。拾った物は残る', () => {
    const run = toSecondBattle();
    expect(run.souls).toBeGreaterThan(0);
    const dead = loseBattle(run);
    expect(dead.status).toBe('active');
    expect(dead.souls).toBe(0);
    expect([dead.floor, dead.room]).toEqual([0, 0]);
    expect(dead.stain).toEqual({ floor: run.floor, room: run.room, souls: run.souls });
    expect(dead.loot).toEqual(run.loot);
    expect(dead.hp).toBeNull();
  });
  it('倒れた部屋で回収すれば取り戻せる', () => {
    const run = toSecondBattle();
    let r = loseBattle(run);
    r = winBattle(d, r, 50, 5); // 1部屋目をやり直し
    while (!stainHere(r)) r = currentRoom(d, r)!.kind === 'chest' ? openChest(d, r) : currentRoom(d, r)!.kind === 'bonfire' ? leaveBonfire(d, r) : winBattle(d, r, 50, 5);
    const before = r.souls;
    r = retrieveStain(r);
    expect(r.souls).toBe(before + run.souls);
    expect(r.stain).toBeNull();
  });
  it('回収しないまま勝っても取り戻せる。回収前にもう一度倒れると失われる', () => {
    const run = toSecondBattle();
    const dead = loseBattle(run);
    // もう一度倒れる（1部屋目で）
    const dead2 = loseBattle(dead);
    expect(dead2.stain).toBeNull(); // ソウル0で倒れたので新しい血痕もない
    // 回収せずに勝つ
    let r = dead;
    while (!stainHere(r)) r = currentRoom(d, r)!.kind === 'chest' ? openChest(d, r) : currentRoom(d, r)!.kind === 'bonfire' ? leaveBonfire(d, r) : winBattle(d, r, 50, 5);
    const won = winBattle(d, r, 50, 5);
    expect(won.stain).toBeNull();
    expect(won.souls).toBe(r.souls + run.souls + currentRoom(d, r)!.souls);
  });
  it('宝箱と落とし物は一度きり。敵のソウルはやり直すたびに得られる', () => {
    const cd = buildCatacomb('knight', 'chest-a', 30);
    let run = startRun('c1', cd);
    let guard = 0;
    while (currentRoom(cd, run)!.kind !== 'chest' && guard++ < 20) {
      const k = currentRoom(cd, run)!.kind;
      if (k === 'boss') return; // 宝箱のない地下墓
      run = k === 'bonfire' ? leaveBonfire(cd, run) : winBattle(cd, run, 50, 5);
    }
    const opened = openChest(cd, run);
    const again = openChest(cd, { ...opened, floor: run.floor, room: run.room });
    expect(isLooted({ ...opened, floor: run.floor, room: run.room })).toBe(true);
    expect(again.loot).toEqual(opened.loot);
    expect(again.souls).toBe(opened.souls);
  });
  it('諦めると何も持ち帰れない', () => {
    const c = newCharacter('vagabond');
    const run = toSecondBattle();
    expect(bankRun(c, abandon(run)).character).toBe(c);
  });
});

describe('退却で持ち帰れるもの', () => {
  it('主を倒した階層で拾ったものだけ。ソウルはすべて', () => {
    const c = newCharacter('vagabond');
    const d = buildCatacomb('knight', 'retreat', 30);
    const run = {
      ...startRun(c.id, d), status: 'retreated' as const, souls: 300, bossDown: [0],
      loot: [
        { kind: 'item' as const, id: 'greatshield', tier: 3 as const, floor: 0 },
        { kind: 'item' as const, id: 'halberd', tier: 3 as const, floor: 1 },
      ],
    };
    const { character, banked } = bankRun(c, run);
    expect(banked.items).toEqual(['greatshield']);
    expect(banked.left.map((l) => l.id)).toEqual(['halberd']);
    expect(character.inventory.items).not.toContain('halberd');
    expect(banked.souls).toBe(300);
  });
  it('途中の階層の主を倒すと、その階層は持ち帰れるようになる（倒れても消えない）', () => {
    let d = buildCatacomb('knight', 'x0', 30);
    for (let i = 1; d.floors.length < 2; i++) d = buildCatacomb('knight', `x${i}`, 30);
    let run = startRun('c', d);
    while (run.floor === 0) {
      const k = currentRoom(d, run)!.kind;
      run = k === 'chest' ? openChest(d, run) : k === 'bonfire' ? leaveBonfire(d, run) : winBattle(d, run, 50, 5);
    }
    expect(run.bossDown).toEqual([0]);
    expect(loseBattle(run).bossDown).toEqual([0]);
  });
});

describe('地下墓ごとの敵のレベル', () => {
  it('煤けた地下墓は自分より低く、それ以外の地下墓は自分より高い', () => {
    for (const id of Object.keys(CATACOMBS)) {
      const d = buildCatacomb(id, 'lv', 40);
      const first = d.floors[0][0];
      const boss = d.floors[d.floors.length - 1].find((r) => r.kind === 'boss')!;
      if (CATACOMBS[id].name.startsWith('煤けた')) {
        expect(charLevel(first.enemy!), id).toBeLessThan(40);
      } else {
        expect(charLevel(first.enemy!), id).toBeGreaterThan(40);
        expect(charLevel(boss.enemy!), id).toBeGreaterThan(40);
      }
    }
  });
});
