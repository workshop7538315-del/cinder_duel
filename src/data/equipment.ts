import type { Armor, ArmorSlot, Shield, Weapon, WeightClass, WeightKey } from '../engine/types';

export const WEIGHTS: Record<WeightKey, WeightClass> = {
  light: { key: 'light', name: '軽装', speedDice: 3, dodge: 3 },
  medium: { key: 'medium', name: '中装', speedDice: 2, dodge: 4 },
  heavy: { key: 'heavy', name: '重装', speedDice: 1, dodge: 6 },
  over: { key: 'over', name: '過重', speedDice: 1, dodge: null },
};

const NO_CUT = { phys: 0, magic: 0, holy: 0 };

/** 素手（右手に何も持たないとき） */
export const FISTS: Weapon = {
  kind: 'weapon', name: '素手', weight: 0, req: {},
  first: 2, inc: 2, maxChain: 2, type: 'phys',
  dmg: { base: 2, scale: { str: 0.2 } }, cut: NO_CUT,
};

/** 右手・左手に持てるもの（武器と触媒） */
export const WEAPONS: Record<string, Weapon> = {
  dagger: {
    kind: 'weapon', name: '刺突のダガー', weight: 1.5, req: { str: 5, dex: 9 },
    first: 2, inc: 2, maxChain: 3, type: 'phys',
    dmg: { base: 4, scale: { dex: 0.4 } },
    cut: { phys: 0.2, magic: 0.1, holy: 0.1 },
    art: { name: '急所突き', cost: { t: 'face', f: [1] }, fp: 3, type: 'phys', unguardable: true,
      dmg: { base: 8, scale: { dex: 0.3, arc: 0.3 } } },
  },
  longsword: {
    kind: 'weapon', name: '騎士の直剣', weight: 3.5, req: { str: 10, dex: 10 },
    first: 3, inc: 2, maxChain: 2, type: 'phys',
    dmg: { base: 6, scale: { str: 0.25, dex: 0.25 } },
    cut: { phys: 0.5, magic: 0.25, holy: 0.25 },
    art: { name: '渾身斬り', cost: { t: 'sum', n: 4 }, fp: 3, type: 'phys',
      dmg: { base: 10, scale: { str: 0.3, dex: 0.3 } } },
  },
  katana: {
    kind: 'weapon', name: '灰打ちの刀', weight: 5.5, req: { str: 10, dex: 14 },
    first: 3, inc: 2, maxChain: 2, type: 'phys',
    dmg: { base: 6, scale: { str: 0.15, dex: 0.5 } },
    cut: { phys: 0.4, magic: 0.2, holy: 0.2 },
    art: { name: '踏み込み斬り', cost: { t: 'face', f: [5, 6] }, fp: 3, type: 'phys',
      dmg: { base: 11, scale: { dex: 0.5 } } },
  },
  battleaxe: {
    kind: 'weapon', name: '戦斧', weight: 6, req: { str: 14, dex: 8 },
    first: 4, inc: 2, maxChain: 2, type: 'phys',
    dmg: { base: 7, scale: { str: 0.5 } },
    cut: { phys: 0.45, magic: 0.2, holy: 0.2 },
    art: { name: '叩き割り', cost: { t: 'set', f: [3, 4] }, fp: 3, type: 'phys',
      dmg: { base: 12, scale: { str: 0.55 } } },
  },
  halberd: {
    kind: 'weapon', name: '番兵の斧槍', weight: 9, req: { str: 14, dex: 12 },
    first: 4, inc: 3, maxChain: 2, type: 'phys',
    dmg: { base: 8, scale: { str: 0.4, dex: 0.15 } },
    cut: { phys: 0.45, magic: 0.25, holy: 0.25 },
    art: { name: '薙ぎ払い', cost: { t: 'face', f: [2, 4, 6] }, fp: 3, type: 'phys',
      dmg: { base: 12, scale: { str: 0.5 } } },
  },
  greatsword: {
    kind: 'weapon', name: '鉄塊の大剣', weight: 13, req: { str: 20, dex: 10 },
    first: 5, inc: 3, maxChain: 2, type: 'phys',
    dmg: { base: 10, scale: { str: 0.55 } },
    cut: { phys: 0.6, magic: 0.3, holy: 0.3 },
    art: { name: '大地割り', cost: { t: 'set', f: [1, 2, 3] }, fp: 4, type: 'phys',
      dmg: { base: 14, scale: { str: 0.65 } } },
  },

  // ---- 血盟騎士の武器（神秘で出血が伸びる） ----
  oath_saber: {
    kind: 'weapon', name: '血盟騎士の曲剣', weight: 4, req: { str: 9, dex: 12, arc: 12 },
    first: 2, inc: 2, maxChain: 3, type: 'phys',
    dmg: { base: 4, scale: { dex: 0.25, arc: 0.2 } },
    bleed: { base: 2, scale: { arc: 0.1 } },
    cut: { phys: 0.35, magic: 0.15, holy: 0.15 },
    art: { name: '血走り', cost: { t: 'face', f: [2, 4, 6] }, fp: 3, type: 'phys',
      dmg: { base: 8, scale: { dex: 0.2, arc: 0.35 } }, bleed: { base: 5, scale: { arc: 0.15 } } },
  },
  oath_cleaver: {
    kind: 'weapon', name: '血盟騎士の大鉈', weight: 9, req: { str: 16, arc: 14 },
    first: 4, inc: 3, maxChain: 2, type: 'phys',
    dmg: { base: 8, scale: { str: 0.3, arc: 0.3 } },
    bleed: { base: 4, scale: { arc: 0.12 } },
    cut: { phys: 0.45, magic: 0.2, holy: 0.2 },
    art: { name: '血の誓約斬り', cost: { t: 'set', f: [2, 5] }, fp: 4, type: 'phys',
      dmg: { base: 12, scale: { str: 0.3, arc: 0.45 } }, bleed: { base: 7, scale: { arc: 0.2 } } },
  },

  // ---- 触媒 ----
  novice_staff: {
    kind: 'catalyst', school: 'sorcery', name: '見習いの杖', weight: 2, req: { int: 10 },
    first: 3, inc: 2, maxChain: 1, type: 'phys',
    dmg: { base: 3, scale: { str: 0.1 } }, cut: { phys: 0.15, magic: 0.3, holy: 0.1 },
    power: { base: 0, scale: { int: 0.5 } },
  },
  star_staff: {
    kind: 'catalyst', school: 'sorcery', name: '星読みの杖', weight: 3.5, req: { int: 20 },
    first: 3, inc: 2, maxChain: 1, type: 'phys',
    dmg: { base: 3, scale: { str: 0.1 } }, cut: { phys: 0.15, magic: 0.4, holy: 0.1 },
    power: { base: 0, scale: { int: 0.75 } },
  },
  prayer_seal: {
    kind: 'catalyst', school: 'incant', name: '祈りの聖印', weight: 1.5, req: { fai: 10 },
    first: 3, inc: 2, maxChain: 1, type: 'phys',
    dmg: { base: 2, scale: { str: 0.1 } }, cut: { phys: 0.1, magic: 0.1, holy: 0.3 },
    power: { base: 0, scale: { fai: 0.5 } },
  },
  oath_seal: {
    kind: 'catalyst', school: 'incant', name: '血盟の聖印', weight: 1.5, req: { fai: 10, arc: 14 },
    first: 3, inc: 2, maxChain: 1, type: 'phys',
    dmg: { base: 2, scale: { str: 0.1 } }, cut: { phys: 0.1, magic: 0.1, holy: 0.25 },
    power: { base: 0, scale: { fai: 0.25, arc: 0.5 } },
  },
  old_talisman: {
    kind: 'catalyst', school: 'incant', name: '古びたタリスマン', weight: 0.5, req: { fai: 18 },
    first: 3, inc: 2, maxChain: 1, type: 'phys',
    dmg: { base: 1, scale: {} }, cut: NO_CUT,
    power: { base: 0, scale: { fai: 0.65, arc: 0.1 } },
  },
};

/** 左手専用 */
export const SHIELDS: Record<string, Shield> = {
  buckler: { kind: 'shield', name: '木の小盾', weight: 2, req: { str: 6 }, cut: { phys: 0.75, magic: 0.3, holy: 0.3 } },
  heater: { kind: 'shield', name: '紋章の中盾', weight: 4.5, req: { str: 10 }, cut: { phys: 1, magic: 0.4, holy: 0.4 } },
  greatshield: {
    kind: 'shield', name: '鉄の大盾', weight: 14, req: { str: 24 }, guardBonus: 1,
    cut: { phys: 1, magic: 0.7, holy: 0.7 },
  },
};

export const ARMOR_SLOTS: { slot: ArmorSlot; name: string }[] = [
  { slot: 'head', name: '頭' },
  { slot: 'chest', name: '胴' },
  { slot: 'arms', name: '腕' },
  { slot: 'legs', name: '脚' },
];

const cut = (phys: number, magic: number, holy: number) => ({ phys, magic, holy });

export const ARMORS: Record<string, Armor> = {
  travel_hood: { slot: 'head', name: '旅人の頭巾', weight: 1, cut: cut(0.02, 0.02, 0.02) },
  travel_coat: { slot: 'chest', name: '旅人の上着', weight: 3, cut: cut(0.05, 0.03, 0.03) },
  travel_gloves: { slot: 'arms', name: '旅人の手袋', weight: 1, cut: cut(0.01, 0.01, 0.01) },
  travel_boots: { slot: 'legs', name: '旅人の脚絆', weight: 1.5, cut: cut(0.02, 0.01, 0.01) },

  sage_hood: { slot: 'head', name: '賢者の帽子', weight: 1, cut: cut(0.01, 0.04, 0.03) },
  sage_robe: { slot: 'chest', name: '賢者のローブ', weight: 3.5, cut: cut(0.03, 0.08, 0.06) },
  sage_trousers: { slot: 'legs', name: '賢者の下衣', weight: 1.5, cut: cut(0.01, 0.03, 0.02) },

  knight_helm: { slot: 'head', name: '騎士の兜', weight: 4, cut: cut(0.04, 0.03, 0.03) },
  knight_armor: { slot: 'chest', name: '騎士の鎧', weight: 9, cut: cut(0.1, 0.05, 0.05) },
  knight_gauntlets: { slot: 'arms', name: '騎士の籠手', weight: 3, cut: cut(0.03, 0.02, 0.02) },
  knight_greaves: { slot: 'legs', name: '騎士の脚甲', weight: 4, cut: cut(0.04, 0.02, 0.02) },

  iron_helm: { slot: 'head', name: '鉄の兜', weight: 6, cut: cut(0.06, 0.03, 0.03) },
  iron_armor: { slot: 'chest', name: '鉄の鎧', weight: 15, cut: cut(0.15, 0.06, 0.06) },
  iron_gauntlets: { slot: 'arms', name: '鉄の籠手', weight: 5, cut: cut(0.05, 0.02, 0.02) },
  iron_greaves: { slot: 'legs', name: '鉄の脚甲', weight: 7, cut: cut(0.06, 0.03, 0.03) },
};

export const isCatalyst = (w: Weapon) => w.kind === 'catalyst';
