import { spellPower, weaponDamage } from '../engine/fighter';
import { scaleLabel, scaled } from '../engine/scaling';
import type { Cost, Fighter, Requirements, Scaling, School } from '../engine/types';
import type { Battle } from '../game/battle';
import { RULES } from './rules';

export type CardKind = 'アイテム' | '技' | '魔術' | '祈祷';

export interface CardDef {
  name: string;
  kind: CardKind;
  cost: Cost;
  fp?: number;
  /** デッキに入れるのに必要な能力値 */
  req?: Requirements;
  /** 魔術・祈祷は対応する触媒が必要 */
  school?: School;
  /** エンチャント（重ね掛け不可。エンチャントできない武器には使えない） */
  enchant?: { bonus?: number; bleed?: number };
  /** 使うときに手札から選んで捨てる枚数（min〜max） */
  discard?: { min: number; max: number };
  /** 自分では使えない（捨てられたときにだけ発動する） */
  unplayable?: boolean;
  /** 捨てられたときに発動する */
  onDiscard?: { text: string; run: (b: Battle, user: Fighter, foe: Fighter) => Promise<void> | void };
  /** NPCの判断用 */
  role: 'attack' | 'heal' | 'buff' | 'utility';
  text: (user: Fighter | null) => string;
  run: (b: Battle, user: Fighter, foe: Fighter, ctx: CardContext) => Promise<void> | void;
}

export interface CardContext {
  /** 使うときに捨てたカードの枚数 */
  discarded: number;
}

const KNIFE: Scaling = { base: 6, scale: { dex: 0.3 } };
const TACKLE: Scaling = { base: 6, scale: { str: 0.5 } };
const BLOOD: Scaling = { base: 6, scale: { arc: 0.6 } };
const BLOOD_BLEED: Scaling = { base: 3, scale: { arc: 0.1 } };
const CLAW_BLEED: Scaling = { base: 4, scale: { arc: 0.12 } };
const FEAST_BLEED: Scaling = { base: 8, scale: { arc: 0.2 } };

/** 魔術・祈祷の威力 = 基礎値 + 触媒の威力 × 倍率 */
const spell = (f: Fighter | null, school: School, base: number, mult = 1): number | null => {
  if (!f) return null;
  const p = spellPower(f, school);
  return p === null ? null : base + Math.floor(p * mult);
};
const num = (v: number | null, fallback: string) => (v === null ? fallback : String(v));

const NO_COST: Cost = { t: 'sum', n: 99 };

export const CARDS: Record<string, CardDef> = {
  flask: {
    name: '灰瓶', kind: 'アイテム', role: 'heal', cost: { t: 'sum', n: 2 },
    text: () => `最大HPの${RULES.flaskRatio * 100}%を回復する。`,
    run: (b, f) => b.heal(f, Math.round(f.maxHp * RULES.flaskRatio)),
  },
  knife: {
    name: '投げナイフ', kind: 'アイテム', role: 'attack', cost: { t: 'sum', n: 2 }, req: { dex: 9 },
    text: (f) => `物理${f ? scaled(KNIFE, f.stats) : KNIFE.base}の攻撃。${scaleLabel(KNIFE)}`,
    run: (b, f, o) => b.strike(f, o, { label: '投げナイフ', dmg: scaled(KNIFE, f.stats), type: 'phys' }),
  },
  kick: {
    name: '蹴り', kind: '技', role: 'attack', cost: { t: 'face', f: [1] },
    text: () => `物理3。当たると相手はこのラウンドの間、ガード消費+${RULES.kickBreak}。`,
    run: (b, f, o) =>
      b.strike(f, o, {
        label: '蹴り', dmg: 3, type: 'phys',
        onHit: (t) => {
          t.buffs.broken = true;
          b.log(`${b.who(t)}は体勢を崩した。`);
        },
      }),
  },
  tackle: {
    name: '体当たり', kind: '技', role: 'attack', cost: { t: 'sum', n: 4 }, req: { str: 16 },
    text: (f) => `物理${f ? scaled(TACKLE, f.stats) : TACKLE.base}の攻撃。${scaleLabel(TACKLE)}`,
    run: (b, f, o) => b.strike(f, o, { label: '体当たり', dmg: scaled(TACKLE, f.stats), type: 'phys' }),
  },
  bloodblade: {
    name: '血の刃', kind: '技', role: 'attack', cost: { t: 'face', f: [2, 4, 6] }, fp: 2, req: { arc: 14 },
    text: (f) => `物理${f ? scaled(BLOOD, f.stats) : BLOOD.base}・出血${f ? scaled(BLOOD_BLEED, f.stats) : BLOOD_BLEED.base}の攻撃。ガードできない。${scaleLabel(BLOOD)}`,
    run: (b, f, o) =>
      b.strike(f, o, { label: '血の刃', dmg: scaled(BLOOD, f.stats), type: 'phys', unguardable: true, bleed: scaled(BLOOD_BLEED, f.stats) }),
  },
  arrow: {
    name: '灰の矢', kind: '魔術', role: 'attack', school: 'sorcery', cost: { t: 'face', f: [2, 4, 6] }, fp: 2, req: { int: 10 },
    text: (f) => `魔力${num(spell(f, 'sorcery', 6), '6+杖')}の攻撃。盾でも防ぎにくい。`,
    run: (b, f, o) => b.strike(f, o, { label: '灰の矢', dmg: spell(f, 'sorcery', 6) ?? 0, type: 'magic' }),
  },
  heavyarrow: {
    name: '重い灰矢', kind: '魔術', role: 'attack', school: 'sorcery', cost: { t: 'sum', n: 5 }, fp: 5, req: { int: 18 },
    text: (f) => `魔力${num(spell(f, 'sorcery', 10, 1.5), '10+杖×1.5')}の攻撃。`,
    run: (b, f, o) => b.strike(f, o, { label: '重い灰矢', dmg: spell(f, 'sorcery', 10, 1.5) ?? 0, type: 'magic' }),
  },
  mend: {
    name: '小さな癒し', kind: '祈祷', role: 'heal', school: 'incant', cost: { t: 'sum', n: 4 }, fp: 3, req: { fai: 10 },
    text: (f) => `HPを${num(spell(f, 'incant', 10), '10+聖印')}回復する。`,
    run: (b, f) => b.heal(f, spell(f, 'incant', 10) ?? 0),
  },
  spear: {
    name: '聖なる槍', kind: '祈祷', role: 'attack', school: 'incant', cost: { t: 'face', f: [1, 3, 5] }, fp: 3, req: { fai: 15 },
    text: (f) => `聖${num(spell(f, 'incant', 7), '7+聖印')}の攻撃。`,
    run: (b, f, o) => b.strike(f, o, { label: '聖なる槍', dmg: spell(f, 'incant', 7) ?? 0, type: 'holy' }),
  },
  blessing: {
    name: '刃の祝福', kind: '祈祷', role: 'buff', school: 'incant', cost: { t: 'sum', n: 3 }, fp: 3, req: { fai: 12 },
    enchant: { bonus: RULES.blessingBonus },
    text: () => `エンチャント：この手番の武器攻撃と戦技のダメージ+${RULES.blessingBonus}。`,
    run: (b, f) => b.enchant(f, '刃の祝福', { bonus: RULES.blessingBonus }),
  },
  // ---- 血の祈祷（血盟騎士） ----
  bloodclaw: {
    name: '血炎の爪痕', kind: '祈祷', role: 'attack', school: 'incant', cost: { t: 'face', f: [2, 4, 6] }, fp: 3, req: { fai: 10, arc: 12 },
    text: (f) => `物理${num(spell(f, 'incant', 5, 0.8), '5+聖印×0.8')}・出血${f ? scaled(CLAW_BLEED, f.stats) : CLAW_BLEED.base}の攻撃。${scaleLabel(CLAW_BLEED).replace('補正', '出血補正')}`,
    run: (b, f, o) =>
      b.strike(f, o, { label: '血炎の爪痕', dmg: spell(f, 'incant', 5, 0.8) ?? 0, type: 'phys', bleed: scaled(CLAW_BLEED, f.stats) }),
  },
  bloodoath: {
    name: '血炎の刃', kind: '祈祷', role: 'buff', school: 'incant', cost: { t: 'sum', n: 3 }, fp: 3, req: { fai: 12, arc: 16 },
    enchant: { bleed: RULES.bloodOathBleed },
    text: () => `エンチャント：この手番の武器攻撃と戦技に出血+${RULES.bloodOathBleed}。`,
    run: (b, f) => b.enchant(f, '血炎の刃', { bleed: RULES.bloodOathBleed }),
  },
  bloodfeast: {
    name: '鮮血の渦', kind: '祈祷', role: 'attack', school: 'incant', cost: { t: 'sum', n: 6 }, fp: 6, req: { fai: 14, arc: 22 },
    text: (f) => `物理${num(spell(f, 'incant', 8, 1.2), '8+聖印×1.2')}・出血${f ? scaled(FEAST_BLEED, f.stats) : FEAST_BLEED.base}の攻撃。${scaleLabel(FEAST_BLEED).replace('補正', '出血補正')}`,
    run: (b, f, o) =>
      b.strike(f, o, { label: '鮮血の渦', dmg: spell(f, 'incant', 8, 1.2) ?? 0, type: 'phys', bleed: scaled(FEAST_BLEED, f.stats) }),
  },

  // ---- 底の魔術（手札を選んで捨てて使う） ----
  quake: {
    name: '地鳴り', kind: '魔術', role: 'attack', school: 'sorcery', cost: { t: 'sum', n: 3 }, fp: 3, req: { int: 14 },
    discard: { min: 1, max: 2 },
    text: (f) => `手札を1〜2枚捨てる。魔力${num(spell(f, 'sorcery', 5, 0.8), '5+杖×0.8')}＋捨てた枚数×6の攻撃。`,
    run: (b, f, o, ctx) =>
      b.strike(f, o, { label: '地鳴り', dmg: (spell(f, 'sorcery', 5, 0.8) ?? 0) + ctx.discarded * 6, type: 'magic' }),
  },
  shipwreck: {
    name: '難破', kind: '魔術', role: 'utility', school: 'sorcery', cost: { t: 'face', f: [2, 4, 6] }, fp: 2, req: { int: 12 },
    discard: { min: 1, max: 3 },
    text: (f) => `手札を1〜3枚捨て、捨てた枚数＋1枚引く。そのあと魔力${num(spell(f, 'sorcery', 4, 0.5), '4+杖×0.5')}の攻撃。`,
    run: async (b, f, o, ctx) => {
      const got = Array.from({ length: ctx.discarded + 1 }, () => b.draw(f)).filter(Boolean).length;
      b.log(`カードを${got}枚引いた。`, b.side(f));
      await b.strike(f, o, { label: '難破', dmg: spell(f, 'sorcery', 4, 0.5) ?? 0, type: 'magic' });
    },
  },
  gale: {
    name: '谷風', kind: '魔術', role: 'attack', school: 'sorcery', cost: { t: 'face', f: [1, 3, 5] }, fp: 3, req: { int: 16 },
    discard: { min: 1, max: 1 },
    text: (f) => `手札を1枚捨てる。魔力${num(spell(f, 'sorcery', 8, 1), '8+杖')}の攻撃。ガードできない。`,
    run: (b, f, o) => b.strike(f, o, { label: '谷風', dmg: spell(f, 'sorcery', 8, 1) ?? 0, type: 'magic', unguardable: true }),
  },
  tide: {
    name: '水底の帳', kind: '魔術', role: 'heal', school: 'sorcery', cost: { t: 'sum', n: 4 }, fp: 4, req: { int: 15 },
    discard: { min: 1, max: 2 },
    text: (f) => `手札を1〜2枚捨てる。HPを（${num(spell(f, 'sorcery', 6, 0.5), '6+杖×0.5')}）×捨てた枚数回復する。`,
    run: (b, f, _o, ctx) => b.heal(f, (spell(f, 'sorcery', 6, 0.5) ?? 0) * ctx.discarded),
  },

  // ---- 底の道具（自分では使えず、捨てられると発動する） ----
  fossil: {
    name: '割れた化石', kind: 'アイテム', role: 'utility', cost: NO_COST, unplayable: true,
    text: () => '使えない。捨てられると、相手に物理10（リアクションできない）。',
    onDiscard: {
      text: '相手に物理10',
      run: (b, f, o) => b.strike(f, o, { label: '割れた化石', dmg: 10, type: 'phys', noReaction: true }),
    },
    run: () => {},
  },
  barrel: {
    name: '浸水した樽', kind: 'アイテム', role: 'utility', cost: NO_COST, unplayable: true,
    text: () => '使えない。捨てられると、スタミナダイス+2（上限まで）。',
    onDiscard: {
      text: 'スタミナダイス+2',
      run: (b, f) => {
        const before = f.stamina;
        f.stamina = Math.min(f.stMax, f.stamina + 2);
        b.log(`スタミナダイス+${f.stamina - before}。`, b.side(f));
      },
    },
    run: () => {},
  },
  feather: {
    name: '谷の羽根', kind: 'アイテム', role: 'utility', cost: NO_COST, unplayable: true,
    text: () => '使えない。捨てられると、カードを2枚引く。',
    onDiscard: {
      text: '2枚引く',
      run: (b, f) => {
        const got = [b.draw(f), b.draw(f)].filter((x): x is string => !!x).map((x) => CARDS[x].name);
        b.log(`カードを引いた：${got.join('、') || 'なし'}`, b.side(f));
      },
    },
    run: () => {},
  },
  droplet: {
    name: '水底の雫', kind: 'アイテム', role: 'utility', cost: NO_COST, unplayable: true,
    text: () => '使えない。捨てられると、最大HPの15%とFP3を回復する。',
    onDiscard: {
      text: 'HP15%・FP3回復',
      run: (b, f) => {
        b.heal(f, Math.round(f.maxHp * 0.15));
        f.fp = Math.min(f.maxFp, f.fp + 3);
      },
    },
    run: () => {},
  },

  breath: {
    name: '深呼吸', kind: '技', role: 'utility', cost: { t: 'face', f: [6] },
    text: () => 'スタミナダイス+2（上限まで）。',
    run: (b, f) => {
      const before = f.stamina;
      f.stamina = Math.min(f.stMax, f.stamina + 2);
      b.log(`スタミナダイス+${f.stamina - before}。`, b.side(f));
    },
  },
  oil: {
    name: '焼き油', kind: 'アイテム', role: 'buff', cost: { t: 'sum', n: 1 },
    enchant: { bonus: RULES.oilBonus },
    text: () => `エンチャント：この手番の武器攻撃と戦技のダメージ+${RULES.oilBonus}。`,
    run: (b, f) => b.enchant(f, '焼き油', { bonus: RULES.oilBonus }),
  },
  stance: {
    name: '構え', kind: '技', role: 'utility', cost: { t: 'sum', n: 3 },
    text: () => `次の自分の手番まで、ガード消費-${RULES.stanceGuardDiscount}、カット率+${RULES.stanceCutBonus * 100}%。`,
    run: (b, f) => {
      f.buffs.stance = true;
      b.log('構えを取った。', b.side(f));
    },
  },
  insight: {
    name: '閃き', kind: '技', role: 'utility', cost: { t: 'face', f: [1, 3, 5] },
    text: () => 'カードを2枚引く。',
    run: (b, f) => {
      const got = [b.draw(f), b.draw(f)].filter((x): x is string => !!x).map((x) => CARDS[x].name);
      b.log(`カードを引いた：${got.join('、') || 'なし'}`, b.side(f));
    },
  },
};

/** 武器ダメージの表示用（焼き油などを含む） */
export const weaponHit = (f: Fighter, s: Scaling) => weaponDamage(f, s) + (f.buffs.enchant?.bonus ?? 0);

/** 自動デッキの優先順（上から、条件を満たすものを入れていく） */
export const AUTO_DECK_PRIORITY: [string, number][] = [
  ['flask', 3], ['heavyarrow', 2], ['arrow', 3], ['bloodfeast', 2], ['bloodclaw', 3], ['bloodoath', 2],
  ['spear', 3], ['mend', 2], ['blessing', 2],
  ['bloodblade', 2], ['tackle', 2], ['knife', 2], ['kick', 2], ['oil', 2], ['stance', 1], ['breath', 1], ['insight', 1],
];
