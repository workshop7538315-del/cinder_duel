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
  it('盗賊は神秘と信仰を少し上げれば、曲剣と血盟の聖印で血の祈祷を組める', () => {
    const c = newCharacter('bandit');
    c.alloc.fai = 4;
    c.alloc.str = 0;
    c.equip.right = 'oath_saber';
    c.equip.left = 'oath_seal';
    const lo = loadout(c);
    expect(lo.rightOk && lo.leftOk).toBe(true);
    c.deck = autoDeck(lo.stats, lo.schools);
    expect(c.deck).toContain('bloodclaw');
    expect(checkCharacter(c).errors).toEqual([]);
  });
  it('信仰の聖印でも血の祈祷は使えるが、神秘が足りないと入れられない', () => {
    const c = newCharacter('prophet');
    c.deck = [...c.deck.slice(0, 11), 'bloodoath'];
    expect(checkCharacter(c).errors.some((e) => e.includes('血の誓い'))).toBe(true);
  });
});
