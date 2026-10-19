import { describe, expect, it } from 'vitest';
import {
  autoAlloc, autoDeck, charLevel, charStats, checkCharacter, loadout, newCharacter,
} from '../src/character/model';
import { CLASSES } from '../src/data/classes';
import { RULES } from '../src/data/rules';
import { curve, derive, levelOf } from '../src/engine/stats';

describe('素性', () => {
  it('レベル = 能力値の合計 − 79（全素性）', () => {
    for (const c of Object.values(CLASSES)) expect(levelOf(c.stats)).toBe(c.level);
  });
  it('初期装備は装備条件を満たし、作ったばかりのキャラは保存できる', () => {
    for (const id of Object.keys(CLASSES)) {
      const c = newCharacter(id);
      const lo = loadout(c);
      expect(lo.rightOk, id).toBe(true);
      expect(lo.leftOk, id).toBe(true);
      expect(checkCharacter(c).errors, id).toEqual([]);
    }
  });
});

describe('派生値の曲線', () => {
  it('点と点の間は直線、範囲外は端の値', () => {
    const pts = [[1, 0], [11, 10], [21, 15]] as const;
    expect(curve(pts, 6)).toBe(5);
    expect(curve(pts, 16)).toBe(12.5);
    expect(curve(pts, 99)).toBe(15);
  });
  it('生命力40までは1あたりHP+2、それ以降は伸びが鈍る', () => {
    const base = CLASSES.wretch.stats;
    expect(derive({ ...base, vit: 21 }).maxHp - derive({ ...base, vit: 20 }).maxHp).toBe(2);
    expect(derive({ ...base, vit: 61 }).maxHp - derive({ ...base, vit: 60 }).maxHp).toBeLessThan(1);
  });
});

describe('レベルアップの振り分け', () => {
  it(`${RULES.levelBudget}レベルを超えて振ると保存できない`, () => {
    const c = newCharacter('vagabond');
    c.alloc.vit = RULES.levelBudget;
    expect(checkCharacter(c).errors).toEqual([]);
    expect(charLevel(c)).toBe(9 + RULES.levelBudget);
    c.alloc.str = 1;
    expect(checkCharacter(c).errors.length).toBeGreaterThan(0);
  });
  it('保存済みの振り分けは下げられない', () => {
    const c = newCharacter('vagabond');
    c.alloc.vit = 5;
    const saved = { ...c.alloc };
    c.alloc.vit = 3;
    expect(checkCharacter(c, { minAlloc: saved }).errors.some((e) => e.includes('生命力'))).toBe(true);
  });
  it('autoAlloc は比率どおりに振る', () => {
    const a = autoAlloc('wretch', 31, { vit: 2, str: 1 });
    expect(a.vit).toBe(20);
    expect(a.str).toBe(10);
  });
});

describe('装備', () => {
  it('装備条件を満たさないと警告（保存はできる）', () => {
    const c = newCharacter('astrologer');
    c.equip.right = 'greatsword';
    expect(checkCharacter(c).errors).toEqual(['「鉄塊の大剣」を持っていません。']);
    c.inventory.items.push('greatsword');
    const r = checkCharacter(c);
    expect(r.errors).toEqual([]);
    expect(r.warnings.some((w) => w.includes('鉄塊の大剣'))).toBe(true);
  });
  it('重さで軽装・中装・重装・過重が決まる', () => {
    const c = newCharacter('bandit');
    expect(loadout(c).weightClass.key).toBe('light');
    c.equip = { right: 'greatsword', left: 'greatshield', head: 'iron_helm', chest: 'iron_armor', arms: 'iron_gauntlets', legs: 'iron_greaves' };
    expect(loadout(c).weightClass.key).toBe('over');
  });
  it('左手に武器は持てない', () => {
    const c = newCharacter('vagabond');
    c.equip.left = 'dagger';
    expect(checkCharacter(c).errors.some((e) => e.includes('左手'))).toBe(true);
  });
});

describe('デッキ', () => {
  it('魔術は杖がないと入れられない', () => {
    const c = newCharacter('astrologer');
    expect(c.deck).toContain('arrow');
    c.equip.left = null;
    expect(checkCharacter(c).errors.some((e) => e.includes('灰の矢'))).toBe(true);
  });
  it('祈祷は聖印かタリスマンが必要', () => {
    const c = newCharacter('prophet');
    expect(c.deck).toContain('mend');
    c.equip.left = 'heater';
    expect(checkCharacter(c).errors.some((e) => e.includes('小さな癒し'))).toBe(true);
  });
  it('能力値が足りないカードは入れられない', () => {
    const c = newCharacter('wretch');
    c.deck = [...autoDeck(charStats(c), []).slice(0, 11), 'tackle'];
    expect(checkCharacter(c).errors.some((e) => e.includes('体当たり'))).toBe(true);
  });
  it('枚数と同名の上限', () => {
    const c = newCharacter('wretch');
    c.deck = Array(RULES.deckMin).fill('kick');
    const errs = checkCharacter(c).errors;
    expect(errs.some((e) => e.includes(`${RULES.copyLimit}枚まで`))).toBe(true);
    c.deck = ['kick'];
    expect(checkCharacter(c).errors.some((e) => e.includes('デッキは'))).toBe(true);
  });
});

import { classKit } from '../src/character/model';
import { parseSave } from '../src/character/storage';

describe('持ち物', () => {
  it('作ったばかりのキャラは素性の装備とカードだけを持つ', () => {
    for (const id of Object.keys(CLASSES)) {
      const c = newCharacter(id);
      const kit = classKit(id);
      expect(c.inventory).toEqual(kit);
      expect(c.deck.length).toBeGreaterThanOrEqual(RULES.deckMin);
      expect(c.souls).toBe(0);
    }
  });
  it('持っている枚数より多くデッキに入れられない', () => {
    const c = newCharacter('vagabond');
    c.inventory.cards.kick = 1;
    c.deck = [...c.deck.filter((x) => x !== 'kick'), 'kick', 'kick'];
    expect(checkCharacter(c).errors.some((e) => e.includes('1枚しか持っていません'))).toBe(true);
  });
  it('v1 のセーブは、装備中のものとデッキのカードを持っていることにして読み込む', () => {
    const v1 = { version: 1, characters: [{ id: 'x', name: '旧', classId: 'astrologer', alloc: {}, equip: { right: 'star_staff', left: null }, deck: ['heavyarrow', 'heavyarrow'] }] };
    const [c] = parseSave(JSON.stringify(v1)).characters;
    expect(c.inventory.items).toContain('star_staff');
    expect(c.inventory.items).toContain('novice_staff'); // 素性の初期装備
    expect(c.inventory.cards.heavyarrow).toBe(2);
    expect(c.souls).toBe(0);
  });
});

import { buyLevel, canBuyLevel, levelBudget as budgetOf, loseLevels } from '../src/character/model';
import { levelCost } from '../src/engine/stats';

describe('レベルアップ（ソウル）', () => {
  it('必要ソウルはレベルが上がるほど増える', () => {
    expect(levelCost(10)).toBeLessThan(levelCost(30));
    expect(levelCost(30)).toBeLessThan(levelCost(60));
    expect(levelCost(1)).toBe(RULES.levelCostMin);
  });
  it('ソウルを払うと、振れるレベルが1増える', () => {
    const c = newCharacter('vagabond');
    c.alloc.vit = RULES.levelBudget;
    c.souls = levelCost(charLevel(c));
    expect(canBuyLevel(c)).toBe(true);
    const b = buyLevel(c);
    expect(b.souls).toBe(0);
    expect(budgetOf(b)).toBe(RULES.levelBudget + 1);
    b.alloc.str += 1;
    expect(checkCharacter(b).errors).toEqual([]);
    expect(canBuyLevel(b)).toBe(false);
  });
  it('失ったレベルは、ソウルで上げ直せる', () => {
    const c = newCharacter('vagabond');
    c.alloc.vit = RULES.levelBudget;
    const lost = loseLevels(c, 3);
    expect(budgetOf(lost)).toBe(RULES.levelBudget - 3);
    let x = { ...lost, souls: 1_000_000 };
    for (let i = 0; i < 3; i++) x = buyLevel(x);
    expect(budgetOf(x)).toBe(RULES.levelBudget);
  });
});
