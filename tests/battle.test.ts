import { describe, expect, it } from 'vitest';
import { checkCharacter, newCharacter } from '../src/character/model';
import { PRESETS } from '../src/data/presets';
import { RULES } from '../src/data/rules';
import { setRng } from '../src/engine/dice';
import { Battle, type BattleIO } from '../src/game/battle';
import { inBand, pickPreset, presetCharacter } from '../src/game/matchmaking';
import { makeFighter } from '../src/game/setup';

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

/** プレイヤーは毎手番すぐ終える（NPCの行動だけを動かす） */
function idleIO(get: () => Battle): BattleIO {
  return {
    log: () => {}, flash: () => {}, wait: () => Promise.resolve(),
    update: () => {
      const b = get();
      if (b?.canAct()) queueMicrotask(() => b.endTurn());
    },
    askDraw: async () => false,
    askTurnDice: async () => 0 as number | 'special',
    askReactDice: async () => 0,
    askReactChoice: async (_h, _d, dodge, guard) => (dodge ? 'dodge' : guard ? 'guard' : 'take'),
    askCounter: async () => 0,
    askDiscard: async (_h, min) => Array.from({ length: min }, (_, i) => i),
    finished: () => {},
  };
}

describe('プリセットの敵', () => {
  it('全員がそのまま戦える状態になっている', () => {
    for (const id of Object.keys(PRESETS)) {
      const r = checkCharacter(presetCharacter(id), { ignoreBudget: true });
      expect(r.errors, id).toEqual([]);
      expect(r.warnings, id).toEqual([]);
    }
  });
  it('レベル帯の中から選ぶ', () => {
    setRng(seeded(1));
    for (let i = 0; i < 20; i++) {
      const c = pickPreset(30, false)!;
      expect(inBand(PRESETS[c.id.replace('preset:', '')].level, 30)).toBe(true);
    }
  });
  it('レベル帯にいなければ一番近い相手', () => {
    const c = pickPreset(1, true)!;
    expect(c.name).toBe('赤目の狩人');
  });
});

describe('戦闘', () => {
  it('NPCがカードや戦技を使って最後まで戦える', async () => {
    for (const id of Object.keys(PRESETS)) {
      setRng(seeded(id.length * 97));
      let b!: Battle;
      const player = newCharacter('wretch');
      b = new Battle(makeFighter(player, true), makeFighter(presetCharacter(id), false), idleIO(() => b));
      await b.run();
      expect(b.over, id).toBe(true);
      expect(b.winner?.isPlayer, id).toBe(false);
      expect(b.round).toBeLessThan(40);
    }
  });
  it(`レベル帯は±${RULES.levelBand}`, () => {
    expect(inBand(30, 45)).toBe(true);
    expect(inBand(30, 46)).toBe(false);
  });
});

import { dodgeBand, dodgeCost } from '../src/engine/fighter';
import { RULES as R } from '../src/data/rules';

describe('回避のコスト', () => {
  it('受けるはずのダメージが幅を超えるごとに+1（上限あり）。幅はレベルで広がる', async () => {
    const { makeFighter } = await import('../src/game/setup');
    const { newCharacter } = await import('../src/character/model');
    const f = makeFighter(newCharacter('samurai'), true);
    const base = f.weight.dodge!;
    const w = dodgeBand(f.level);
    expect(dodgeCost(f, 0)).toBe(base);
    expect(dodgeCost(f, w - 1)).toBe(base);
    expect(dodgeCost(f, w)).toBe(base + 1);
    expect(dodgeCost(f, w * 2)).toBe(base + 2);
    expect(dodgeCost(f, 9999)).toBe(base + R.dodgeExtraMax);
    expect(dodgeBand(80)).toBeGreaterThan(dodgeBand(10));
  });
});

describe('リアクションの出目をためる', () => {
  it('使わなかった出目は次のリアクションに使え、相手の手番が終わるとスタミナに戻る', async () => {
    const { makeFighter } = await import('../src/game/setup');
    const { newCharacter } = await import('../src/character/model');
    const { Battle } = await import('../src/game/battle');
    const io = {
      log: () => {}, update: () => {}, flash: () => {}, wait: () => Promise.resolve(), finished: () => {},
      askReactDice: async () => 0, askReactChoice: async () => 'dodge',
    } as unknown as import('../src/game/battle').BattleIO;
    const p = makeFighter(newCharacter('samurai'), true);
    const e = makeFighter(newCharacter('wretch'), false);
    const b = new Battle(p, e, io);
    p.stamina = 0;
    p.reactPool = [{ id: 901, v: 6 }, { id: 902, v: 6 }, { id: 903, v: 1 }];
    const hp = p.hp;
    await b.strike(e, p, { label: 'a', dmg: 3, type: 'phys' });
    expect(p.hp).toBe(hp);
    expect(p.reactPool.map((d) => d.v).sort()).toEqual([1, 6]);
    await b.strike(e, p, { label: 'b', dmg: 3, type: 'phys' });
    expect(p.hp).toBe(hp);
    expect(p.reactPool.map((d) => d.v)).toEqual([1]);
    (b as unknown as { returnPool(f: typeof p): void }).returnPool(p);
    expect(p.reactPool).toEqual([]);
    expect(p.stamina).toBe(1);
  });
});
