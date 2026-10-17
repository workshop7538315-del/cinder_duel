import { scaleLabel, scaled } from '../engine/scaling';
import type { Cost, Fighter, Scaling } from '../engine/types';
import type { Battle } from '../game/battle';
import { RULES } from './rules';

export interface CardDef {
  name: string;
  kind: 'アイテム' | '技' | '魔術' | '奇跡';
  cost: Cost;
  fp?: number;
  text: (user: Fighter) => string;
  run: (b: Battle, user: Fighter, foe: Fighter) => Promise<void> | void;
}

const KNIFE: Scaling = { base: 5, scale: { dex: 0.2 } };
const ARROW: Scaling = { base: 6, scale: { int: 0.6 } };
const MEND: Scaling = { base: 6, scale: { fai: 1.0 } };

export const CARDS: Record<string, CardDef> = {
  flask: {
    name: '灰瓶', kind: 'アイテム', cost: { t: 'sum', n: 2 },
    text: () => 'HPを14回復する。',
    run: (b, f) => b.heal(f, 14),
  },
  knife: {
    name: '投げナイフ', kind: 'アイテム', cost: { t: 'sum', n: 2 },
    text: (f) => `物理${scaled(KNIFE, f.stats)}の攻撃。${scaleLabel(KNIFE)}`,
    run: (b, f, o) => b.strike(f, o, { label: '投げナイフ', dmg: scaled(KNIFE, f.stats), type: 'phys' }),
  },
  kick: {
    name: '蹴り', kind: '技', cost: { t: 'face', f: [1] },
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
  arrow: {
    name: '灰の矢', kind: '魔術', cost: { t: 'face', f: [2, 4, 6] }, fp: 2,
    text: (f) => `魔法${scaled(ARROW, f.stats)}の攻撃。盾でも防ぎにくい。${scaleLabel(ARROW)}`,
    run: (b, f, o) => b.strike(f, o, { label: '灰の矢', dmg: scaled(ARROW, f.stats), type: 'magic' }),
  },
  mend: {
    name: '小さな癒し', kind: '奇跡', cost: { t: 'sum', n: 4 }, fp: 3,
    text: (f) => `HPを${scaled(MEND, f.stats)}回復する。${scaleLabel(MEND)}`,
    run: (b, f) => b.heal(f, scaled(MEND, f.stats)),
  },
  breath: {
    name: '深呼吸', kind: '技', cost: { t: 'face', f: [6] },
    text: () => 'スタミナダイス+2（上限まで）。',
    run: (b, f) => {
      const before = f.stamina;
      f.stamina = Math.min(f.stMax, f.stamina + 2);
      b.log(`スタミナダイス+${f.stamina - before}。`, b.side(f));
    },
  },
  oil: {
    name: '焼き油', kind: 'アイテム', cost: { t: 'sum', n: 1 },
    text: () => `この手番の武器攻撃と戦技のダメージ+${RULES.oilBonus}。`,
    run: (b, f) => {
      f.buffs.oil = true;
      b.log('武器に焼き油を塗った。', b.side(f));
    },
  },
  stance: {
    name: '構え', kind: '技', cost: { t: 'sum', n: 3 },
    text: () => `次の自分の手番まで、ガード消費-${RULES.stanceGuardDiscount}、カット率+${RULES.stanceCutBonus * 100}%。`,
    run: (b, f) => {
      f.buffs.stance = true;
      b.log('構えを取った。', b.side(f));
    },
  },
  insight: {
    name: '閃き', kind: '技', cost: { t: 'face', f: [1, 3, 5] },
    text: () => 'カードを2枚引く。',
    run: (b, f) => {
      const got = [b.draw(f), b.draw(f)].filter((x): x is string => !!x).map((x) => CARDS[x].name);
      b.log(`カードを引いた：${got.join('、') || 'なし'}`, b.side(f));
    },
  },
};

export const STARTER_DECK = [
  'flask', 'flask', 'knife', 'knife', 'kick', 'kick',
  'arrow', 'mend', 'breath', 'oil', 'stance', 'insight',
];
