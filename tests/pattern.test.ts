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
