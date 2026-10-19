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
