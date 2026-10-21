import { describe, expect, it } from 'vitest';
import { newCharacter } from '../src/character/model';
import { FIXED_CATACOMBS } from '../src/data/fixed';
import { RULES } from '../src/data/rules';
import { buildCatacomb, buildFixed } from '../src/dungeon/generate';
import { Battle, type BattleIO } from '../src/game/battle';
import { enterPhase2IfNeeded } from '../src/game/pattern';
import { makeFighter } from '../src/game/setup';

const io = { log: () => {}, update: () => {}, flash: () => {}, wait: () => Promise.resolve(), finished: () => {},
  askReactDice: async () => -1, askDiscardCount: async (m: number) => m } as unknown as BattleIO;

const spawn = () => {
  const d = buildFixed('abyss_temple', 70);
  const boss = d.floors.at(-1)!.at(-1)!;
  return { d, boss };
};

describe('淵の神殿', () => {
  it('3階層。主は「淵より来るもの」で、第二形態と固有の仕掛けがある', () => {
    const { d, boss } = spawn();
    expect(d.rank).toBe('困難');
    expect(d.floors).toHaveLength(3);
    expect(boss.enemy!.name).toBe('淵より来るもの');
    expect(boss.enemy!.foeRank).toBe('主');
    expect(boss.enemy!.behavior!.aura?.discard).toBe(1);
    expect(boss.enemy!.behavior!.phase2?.aura?.curse).toBeGreaterThan(0);
    const loot = d.floors.flat().map((r) => r.loot?.id);
    for (const id of ['abyss_manifest', 'abyss_great_seal', 'abyss_heart']) expect(loot).toContain(id);
  });
  it('手がかりは邪教徒の地下墓でだけ見つかり、ほかの地下墓の手がかりは前のまま', () => {
    expect(Object.keys(FIXED_CATACOMBS).filter((k) => !FIXED_CATACOMBS[k].clueFrom)).toEqual(['ashen_cathedral', 'blood_altar']);
    let temple = 0;
    for (let i = 0; i < 400; i++) {
      for (const r of buildCatacomb('cult', `t${i}`, 40).floors.flat()) if (r.clue === 'abyss_temple') temple++;
      for (const r of buildCatacomb('knight', `t${i}`, 40).floors.flat()) expect(r.clue).not.toBe('abyss_temple');
    }
    expect(temple).toBeGreaterThan(0);
  });
});

describe('主の固有の仕掛け', () => {
  it('ラウンドの初めに手札をランダムに捨てさせる。捨てられた邪教の祈祷は、こちらのものとして発動する', async () => {
    const { boss } = spawn();
    const p = makeFighter(newCharacter('vagabond'), true);
    const e = makeFighter(boss.enemy!, false);
    const b = new Battle(p, e, io);
    p.hand = ['abyss_whisper'];
    const hp = e.hp;
    await (b as unknown as { applyAura(f: typeof e, o: typeof p): Promise<void> }).applyAura(e, p);
    expect(p.hand).toEqual([]);
    expect(p.discard).toContain('abyss_whisper');
    expect(e.hp).toBeLessThan(hp); // 囁きの残響が主に当たる
  });
  it('第二形態では仕掛けが変わり、呪死も溜める', async () => {
    const { boss } = spawn();
    const p = makeFighter(newCharacter('vagabond'), true);
    const e = makeFighter(boss.enemy!, false);
    const b = new Battle(p, e, io);
    e.hp = Math.floor(e.maxHp * 0.4);
    enterPhase2IfNeeded(b, e);
    expect(e.pattern!.behavior.aura!.name).toBe('淵の深まり');
    p.hand = [];
    await (b as unknown as { applyAura(f: typeof e, o: typeof p): Promise<void> }).applyAura(e, p);
    expect(p.curse).toBe(2);
    p.curse = RULES.curseThreshold - 1;
    await (b as unknown as { applyAura(f: typeof e, o: typeof p): Promise<void> }).applyAura(e, p);
    expect(p.hp).toBe(0);
    expect(b.over).toBe(true);
  });
});
