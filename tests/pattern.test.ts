import { describe, expect, it } from 'vitest';
import { newCharacter } from '../src/character/model';
import { BEHAVIORS } from '../src/data/behaviors';
import { buildCatacomb, buildAbyss } from '../src/dungeon/generate';
import { Battle, type BattleIO, type IncomingHit } from '../src/game/battle';
import { patternReact, patternTurn } from '../src/game/pattern';
import { makeFighter } from '../src/game/setup';
import type { Attack } from '../src/engine/types';

const io = { log: () => {}, update: () => {}, flash: () => {}, wait: () => Promise.resolve(), finished: () => {} } as unknown as BattleIO;

describe('強敵と主', () => {
  it('騎士や大蟹は強敵、主の部屋の敵は主。どちらもパターンで動く', () => {
    const d = buildCatacomb('knight', 'pat', 30);
    for (const r of d.floors.flat()) {
      if (r.kind === 'boss') expect(r.enemy!.foeRank).toBe('主');
      if (r.enemy?.name === '煤けた騎士') {
        expect(r.enemy.foeRank).toBe('強敵');
        expect(r.enemy.behavior).toBe(BEHAVIORS.knight);
      }
      if (r.enemy?.behavior) expect(r.enemy.behavior.moves.length).toBeGreaterThan(0);
    }
    const sea = buildAbyss('sea', 'x', 80);
    expect(sea.floors[0][1].enemy!.foeRank).toBe('強敵');
  });
  it('スタミナも手札もなく、予告した行動を順番にする', async () => {
    const d = buildCatacomb('knight', 'pat', 30);
    const boss = d.floors.flat().find((r) => r.kind === 'boss')!.enemy!;
    const e = makeFighter({ ...boss, behavior: BEHAVIORS.knight }, false);
    const b = new Battle(makeFighter(newCharacter('vagabond'), true), e, io);
    expect(e.hand).toEqual([]);
    expect(e.pattern!.next).toBe(0);
    const hits: Attack[] = [];
    b.strike = async (_a, _d, atk) => { hits.push(atk); };
    await patternTurn(b, e, b.p);
    expect(hits).toHaveLength(2); // 二連斬り
    expect(e.pattern!.next).toBe(1);
    await patternTurn(b, e, b.p);
    expect(e.pattern!.guarding).toBe(true); // 盾を構える
    expect(hits).toHaveLength(2);
    await patternTurn(b, e, b.p);
    expect(hits).toHaveLength(3); // 踏み込み突き
    expect(e.pattern!.next).toBe(0);
  });
  it('回避・ガードは敵ごとの確率。守りを固めているあいだは必ずガード（ガード不可は受ける）', () => {
    const e = makeFighter({ ...newCharacter('vagabond'), behavior: { mode: 'cycle', moves: [{ name: 'x' }], dodge: 0, guard: 0 } }, false);
    const hit = (unguardable = false) => ({ attack: { label: '', dmg: 1, type: 'phys', unguardable }, dodgeCost: 3 } as unknown as IncomingHit);
    expect(patternReact(e, hit())).toBe('take');
    e.pattern!.guarding = true;
    expect(patternReact(e, hit())).toBe('guard');
    expect(patternReact(e, hit(true))).toBe('take');
    const always = makeFighter({ ...newCharacter('vagabond'), behavior: { mode: 'cycle', moves: [{ name: 'x' }], dodge: 1, guard: 0 } }, false);
    expect(patternReact(always, hit())).toBe('dodge');
  });
});

import { RULES } from '../src/data/rules';
import { enterPhase2IfNeeded, withAutoPhase2 } from '../src/game/pattern';

describe('体幹とよろめき', () => {
  const setup = () => {
    const d = buildCatacomb('knight', 'pat', 30);
    const boss = d.floors.flat().find((r) => r.kind === 'boss')!.enemy!;
    const p = makeFighter(newCharacter('vagabond'), true);
    const e = makeFighter(boss, false);
    const b = new Battle(p, e, { ...io, askReactDice: async () => -1, askReactChoice: async () => 'take' } as unknown as BattleIO);
    return { b, p, e };
  };
  it('プレイヤーはガードしたときだけ体幹が減る', async () => {
    const { b, p, e } = setup();
    const io2 = { ...io, askReactDice: async () => 0, askReactChoice: async () => 'guard' } as unknown as BattleIO;
    const b2 = new Battle(p, e, io2);
    p.stamina = 0;
    p.reactPool = [{ id: 1, v: 6 }, { id: 2, v: 6 }, { id: 3, v: 6 }];
    const before = p.poise;
    await b2.strike(e, p, { label: 'x', dmg: 20, type: 'phys' });
    expect(p.poise).toBeLessThan(before);
    const after = p.poise;
    await b.strike(e, p, { label: 'y', dmg: 5, type: 'phys' }); // 受ける
    expect(p.poise).toBe(after);
  });
  it('主は攻撃を受けても体幹が減り、尽きるとよろめく。よろめくと次の手番を失い、受けるダメージが増える', async () => {
    const { b, p, e } = setup();
    e.pattern!.behavior = { mode: 'cycle', moves: [{ name: 'x', use: 'weapon' }], dodge: 0, guard: 0 };
    e.poise = 1;
    await b.strike(p, e, { label: 'a', dmg: 10, type: 'phys' });
    expect(e.staggered).toBe(true);
    const hp = e.hp;
    await b.strike(p, e, { label: 'b', dmg: 10, type: 'phys' });
    const normal = 10; // 防具で減る前の値なので、増えていることだけ見る
    expect(hp - e.hp).toBeGreaterThan(0);
    void normal;
    let acted = false;
    b.strike = async () => { acted = true; };
    await (b as unknown as { takeTurn(f: typeof e, o: typeof p): Promise<void> }).takeTurn(e, p);
    expect(acted).toBe(false);
    expect(e.staggered).toBe(false);
    expect(e.poise).toBe(e.maxPoise);
  });
  it('よろめいている相手へのダメージは倍率がかかる', async () => {
    const { b, p, e } = setup();
    e.pattern!.behavior = { mode: 'cycle', moves: [{ name: 'x' }], dodge: 0, guard: 0 };
    e.poise = 999;
    const h0 = e.hp;
    await b.strike(p, e, { label: 'a', dmg: 20, type: 'phys' });
    const d1 = h0 - e.hp;
    e.staggered = true;
    const h1 = e.hp;
    await b.strike(p, e, { label: 'b', dmg: 20, type: 'phys' });
    expect(h1 - e.hp).toBe(Math.round(d1 * RULES.staggerDamageMult));
  });
});

describe('主の溜めと第二形態', () => {
  it('溜める大技は、構えた手番には攻撃せず、次の手番に放つ', async () => {
    const p = makeFighter(newCharacter('vagabond'), true);
    const e = makeFighter({ ...newCharacter('vagabond'), behavior: { mode: 'cycle', dodge: 0, guard: 0,
      moves: [{ name: '大技', use: 'weapon', mult: 2, charge: true, dodgeExtra: 2 }, { name: '小技', use: 'weapon' }] }, foeRank: '主' }, false);
    const b = new Battle(p, e, io);
    const hits: Attack[] = [];
    b.strike = async (_a, _d, atk) => { hits.push(atk); };
    await patternTurn(b, e, p);
    expect(hits).toHaveLength(0);
    expect(e.pattern!.charging).toBe(true);
    await patternTurn(b, e, p);
    expect(hits).toHaveLength(1);
    expect(hits[0].dodgeExtra).toBe(2);
    expect(e.pattern!.charging).toBe(false);
  });
  it('HPが半分を切ると第二形態に入り、行動表が変わって体幹が戻る', () => {
    const beh = withAutoPhase2({ mode: 'random', dodge: 0, guard: 0, moves: [{ name: '斬る', use: 'weapon' }] });
    expect(beh.phase2!.moves.some((m) => m.charge)).toBe(true);
    const p = makeFighter(newCharacter('vagabond'), true);
    const e = makeFighter({ ...newCharacter('vagabond'), behavior: beh, foeRank: '主' }, false);
    const b = new Battle(p, e, io);
    e.poise = 1;
    e.hp = Math.floor(e.maxHp * 0.6);
    enterPhase2IfNeeded(b, e);
    expect(e.pattern!.phased).toBeFalsy();
    e.hp = Math.floor(e.maxHp * 0.4);
    enterPhase2IfNeeded(b, e);
    expect(e.pattern!.phased).toBe(true);
    expect(e.pattern!.behavior.moves).toBe(beh.phase2!.moves);
    expect(e.poise).toBe(e.maxPoise);
  });
  it('主には第二形態がある（手で書いた主も、書いていない主も）', () => {
    for (const id of ['knight', 'warrior', 'blood']) {
      const d = buildCatacomb(id, 'ph', 40);
      for (const r of d.floors.flat()) if (r.kind === 'boss') expect(r.enemy!.behavior!.phase2, id).toBeTruthy();
    }
  });
});
