import type { Crystal, CrystalKey } from '../engine/types';

/**
 * 淵結晶。底の武器にはめて強める（ブラッドボーンの血晶石のようなもの）。
 * 底ごとに出やすい種類があり、値は拾うたびにばらつく。
 * 深海では、マイナス効果つきの「呪われた淵結晶」が出る（プラスが大きい）。
 */
export interface CrystalKind {
  /** 結晶の名前（〇〇の淵結晶） */
  name: string;
  /** 効果の説明に使う言葉 */
  label: string;
  /** true なら割合（0.1 = 10%） */
  pct: boolean;
  /** 底で出るときのプラスの幅 */
  plus: [number, number];
  /** 呪われた淵結晶のプラスの幅 */
  cursed: [number, number];
  /** マイナスになりうるなら、その幅（弱める量） */
  minus?: [number, number];
  /** 刻み（割合は 0.01、そのほかは 1） */
  step: number;
}

export const CRYSTAL_KINDS: Record<CrystalKey, CrystalKind> = {
  atk: { name: '鋭利', label: '武器攻撃のダメージ', pct: true, plus: [0.05, 0.15], cursed: [0.15, 0.3], minus: [0.05, 0.12], step: 0.01 },
  art: { name: '技巧', label: '戦技のダメージ', pct: true, plus: [0.08, 0.2], cursed: [0.2, 0.4], step: 0.01 },
  spell: { name: '叡智', label: '魔術・祈祷の威力', pct: true, plus: [0.05, 0.15], cursed: [0.15, 0.3], step: 0.01 },
  bleed: { name: '血潮', label: '武器が当たったときの出血', pct: false, plus: [2, 5], cursed: [5, 9], step: 1 },
  curse: { name: '怨嗟', label: '武器が当たったときの呪死', pct: false, plus: [1, 2], cursed: [2, 4], step: 1 },
  hp: { name: '生命', label: '最大HP', pct: true, plus: [0.03, 0.1], cursed: [0.1, 0.2], minus: [0.05, 0.15], step: 0.01 },
  fp: { name: '精神', label: '最大FP', pct: false, plus: [2, 5], cursed: [5, 9], minus: [2, 6], step: 1 },
  cut: { name: '堅牢', label: 'カット率', pct: true, plus: [0.03, 0.08], cursed: [0.08, 0.15], minus: [0.05, 0.12], step: 0.01 },
  guard: { name: '受け流し', label: 'ガード消費の軽さ', pct: false, plus: [1, 1], cursed: [1, 2], minus: [1, 1], step: 1 },
  stMax: { name: '持久', label: 'スタミナダイスの上限', pct: false, plus: [1, 1], cursed: [1, 2], minus: [1, 1], step: 1 },
};

export const CRYSTAL_KEYS = Object.keys(CRYSTAL_KINDS) as CrystalKey[];
/** マイナスになりうるもの */
export const MINUS_KEYS = CRYSTAL_KEYS.filter((k) => CRYSTAL_KINDS[k].minus);

/** 底ごとの出やすさ（重み）。書いていないものは 1 */
export const CRYSTAL_TENDENCY: Record<string, Partial<Record<CrystalKey, number>>> = {
  earth: { atk: 6, hp: 4 },
  hull: { art: 6, stMax: 3, fp: 2 },
  gorge: { bleed: 6, atk: 3, guard: 2 },
  lake: { spell: 6, fp: 4 },
  sea: { curse: 6, cut: 4 },
};

export const CRYSTAL = {
  /** 武器にはめられる数（底の武器の既定） */
  sockets: 3,
  /** 底のバジリスクが淵結晶を落とす確率（主は必ず） */
  basiliskDrop: 0.5,
  /** 海底・深海の敵が淵結晶を落とす確率（主は必ず） */
  seaDrop: 0.35,
} as const;

const roll = (r: () => number, [lo, hi]: [number, number], step: number): number => {
  const n = Math.round((lo + r() * (hi - lo)) / step) * step;
  return Math.round(n * 100) / 100;
};

function weighted(r: () => number, weights: Partial<Record<CrystalKey, number>>, keys: CrystalKey[] = CRYSTAL_KEYS): CrystalKey {
  const w = keys.map((k) => weights[k] ?? 1);
  let x = r() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < keys.length; i++) if ((x -= w[i]) < 0) return keys[i];
  return keys[keys.length - 1];
}

/** 底の淵結晶を作る（その底の出やすさで種類が決まる） */
export function rollCrystal(r: () => number, abyssKey: string, uid = ''): Crystal {
  const key = weighted(r, CRYSTAL_TENDENCY[abyssKey] ?? {});
  const k = CRYSTAL_KINDS[key];
  return { uid, name: `${k.name}の淵結晶`, plus: { key, value: roll(r, k.plus, k.step) } };
}

/** 呪われた淵結晶を作る。強める対象は決まっていて（深海のシードで決まる）、強さとマイナスはばらつく */
export function rollCursedCrystal(r: () => number, plusKey: CrystalKey, uid = ''): Crystal {
  const k = CRYSTAL_KINDS[plusKey];
  const mk = weighted(r, {}, MINUS_KEYS.filter((x) => x !== plusKey));
  const m = CRYSTAL_KINDS[mk];
  return {
    uid, name: `呪われた${k.name}の淵結晶`,
    plus: { key: plusKey, value: roll(r, k.cursed, k.step) },
    minus: { key: mk, value: roll(r, m.minus!, m.step) },
  };
}

const fmt = (key: CrystalKey, v: number) => (CRYSTAL_KINDS[key].pct ? `${Math.round(v * 100)}%` : String(v));
/** 効果の説明 */
export function crystalText(c: Crystal): string {
  const p = `${CRYSTAL_KINDS[c.plus.key].label}+${fmt(c.plus.key, c.plus.value)}`;
  return c.minus ? `${p}／${CRYSTAL_KINDS[c.minus.key].label}−${fmt(c.minus.key, c.minus.value)}` : p;
}
