import { describe, expect, it } from 'vitest';
import { autoDeck, checkCharacter, loadout, newCharacter } from '../src/character/model';
import { RULES } from '../src/data/rules';
import { addBleed, weaponBleed } from '../src/engine/fighter';
import { scaled } from '../src/engine/scaling';
import { makeFighter } from '../src/game/setup';

describe('出血', () => {
  it('上限まで溜まると弾けて、最大HP×割合＋固定値のダメージ。値は0に戻る', () => {
    const f = makeFighter(newCharacter('bandit'), false);
    expect(addBleed(f, RULES.bleedThreshold - 1)).toBe(0);
    expect(f.bleed).toBe(RULES.bleedThreshold - 1);
    expect(addBleed(f, 1)).toBe(Math.round(f.maxHp * RULES.bleedBurstRatio) + RULES.bleedBurstBase);
    expect(f.bleed).toBe(0);
  });
  it('神秘が高いほど武器の出血が伸びる', () => {
    const c = newCharacter('bandit');
    c.equip.right = 'oath_saber';
    const low = makeFighter(c, true);
    c.alloc.arc = 20;
    const high = makeFighter(c, true);
    expect(weaponBleed(high, high.right.bleed)).toBeGreaterThan(weaponBleed(low, low.right.bleed));
  });
  it('装備条件を満たさないと出血は基礎値×倍率だけ', () => {
    const c = newCharacter('wretch');
    c.equip.right = 'oath_cleaver';
    const f = makeFighter(c, true);
    expect(f.rightOk).toBe(false);
    expect(weaponBleed(f, f.right.bleed)).toBe(Math.floor(4 * RULES.reqPenalty));
    expect(scaled(f.right.bleed!, f.stats)).toBeGreaterThan(weaponBleed(f, f.right.bleed));
  });
});

describe('血盟騎士の装備と祈祷', () => {
  it('盗賊は神秘と信仰を少し上げれば、レドゥビアと血盟の印で血の祈祷を組める', () => {
    const c = newCharacter('bandit');
    c.alloc.fai = 4;
    c.alloc.str = 0;
    c.equip.right = 'oath_saber';
    c.equip.left = 'oath_seal';
    const lo = loadout(c);
    expect(lo.rightOk && lo.leftOk).toBe(true);
    c.deck = autoDeck(lo.stats, lo.schools, lo.right);
    expect(c.deck).toContain('bloodclaw');
    expect(checkCharacter(c).errors).toEqual([]);
  });
  it('信仰の聖印でも血の祈祷は使えるが、神秘が足りないと入れられない', () => {
    const c = newCharacter('prophet');
    c.deck = [...c.deck.slice(0, 11), 'bloodoath'];
    expect(checkCharacter(c).errors.some((e) => e.includes('血炎の刃'))).toBe(true);
  });
});

import { Battle, type BattleIO } from '../src/game/battle';
import { setRng } from '../src/engine/dice';

describe('エンチャント', () => {
  it('レドゥビアと血のマチェーテはエンチャントのカードを入れられない', () => {
    const c = newCharacter('bandit');
    c.equip.right = 'oath_saber';
    c.deck = [...c.deck.filter((x) => x !== 'oil').slice(0, 11), 'oil'];
    expect(checkCharacter(c).errors.some((e) => e.includes('エンチャント'))).toBe(true);
    const lo = loadout(c);
    expect(autoDeck(lo.stats, lo.schools, lo.right)).not.toContain('oil');
  });
  it('重ね掛けはできず、新しく掛けると前のものが消える', () => {
    const logs: string[] = [];
    const io = { log: (t: string) => logs.push(t) } as unknown as BattleIO;
    const b = new Battle(makeFighter(newCharacter('vagabond'), true), makeFighter(newCharacter('bandit'), false), io);
    b.enchant(b.p, '焼き油', { bonus: 4 });
    b.enchant(b.p, '血炎の刃', { bleed: 5 });
    expect(b.p.buffs.enchant).toEqual({ name: '血炎の刃', bonus: 0, bleed: 5 });
    expect(logs[1]).toContain('「焼き油」が消え');
  });
});

describe('王朝鉈技', () => {
  type Internal = { afterAction(f: unknown, isAttack: boolean): Promise<void> };
  function setup() {
    setRng(() => 0.99); // 出目はすべて6
    const e = newCharacter('vagabond');
    e.equip.right = 'oath_cleaver';
    e.alloc.str = 2;
    e.alloc.arc = 7;
    const logs: string[] = [];
    const io = {
      log: (t: string) => logs.push(t), update: () => {}, flash: () => {}, wait: () => Promise.resolve(),
      askReactDice: async (_h: unknown, max: number) => max,
      askReactChoice: async () => 'take' as const,
    } as unknown as BattleIO;
    const b = new Battle(makeFighter(newCharacter('bandit'), true), makeFighter(e, false), io);
    b.p.stamina = 3;
    b.e.stamina = 6;
    return { b, logs };
  }

  it('NPCは攻撃をかわすのに使い、反撃の構えを取る', async () => {
    const { b, logs } = setup();
    // プレイヤーの攻撃に対して、NPCは王朝鉈技で回避する
    await b.strike(b.p, b.e, { label: 'テスト', dmg: 20, type: 'phys' });
    expect(b.e.hp).toBe(b.e.maxHp);
    expect(b.counter?.owner).toBe(b.e);
    expect(logs.some((l) => l.includes('「王朝鉈技」でかわし'))).toBe(true);
  });
  it('相手が攻撃以外（手番終了など）をしたら、追加で払って反撃する', async () => {
    const { b, logs } = setup();
    await b.strike(b.p, b.e, { label: 'テスト', dmg: 20, type: 'phys' });
    const hp = b.p.hp;
    await (b as unknown as Internal).afterAction(b.p, false);
    expect(logs.some((l) => l.includes('王朝鉈技・反撃'))).toBe(true);
    expect(b.p.hp).toBeLessThan(hp);
    expect(b.counter).toBeNull();
  });
  it('相手が続けて攻撃したら、反撃の構えは解ける', async () => {
    const { b, logs } = setup();
    await b.strike(b.p, b.e, { label: 'テスト', dmg: 20, type: 'phys' });
    await (b as unknown as Internal).afterAction(b.p, true);
    expect(b.counter).toBeNull();
    expect(logs.some((l) => l.includes('反撃'))).toBe(true); // 構えのログだけ
    expect(logs.some((l) => l.includes('王朝鉈技・反撃'))).toBe(false);
  });
});
