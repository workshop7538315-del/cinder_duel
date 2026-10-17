import type { Shield, Weapon, WeightClass, WeightKey } from '../engine/types';

export const WEIGHTS: Record<WeightKey, WeightClass> = {
  light: { name: '軽装', speedDice: 3, dodge: 3, armor: 0 },
  medium: { name: '中装', speedDice: 2, dodge: 4, armor: 1 },
  heavy: { name: '重装', speedDice: 1, dodge: 6, armor: 3 },
};

export const WEAPONS: Record<string, Weapon> = {
  dagger: {
    name: '刺突のダガー', first: 2, inc: 2, maxChain: 3, type: 'phys',
    dmg: { base: 4, scale: { dex: 0.4 } },
    cut: { phys: 0.2, magic: 0 },
    art: { name: '急所突き', cost: { t: 'face', f: [1] }, fp: 3, type: 'phys', unguardable: true,
      dmg: { base: 8, scale: { dex: 0.3, arc: 0.3 } } },
  },
  sword: {
    name: '騎士の直剣', first: 3, inc: 2, maxChain: 2, type: 'phys',
    dmg: { base: 6, scale: { str: 0.25, dex: 0.25 } },
    cut: { phys: 0.5, magic: 0.2 },
    art: { name: '渾身斬り', cost: { t: 'sum', n: 4 }, fp: 3, type: 'phys',
      dmg: { base: 10, scale: { str: 0.3, dex: 0.3 } } },
  },
  greatsword: {
    name: '鉄塊の大剣', first: 5, inc: 3, maxChain: 2, type: 'phys',
    dmg: { base: 10, scale: { str: 0.5 } },
    cut: { phys: 0.6, magic: 0.2 },
    art: { name: '大地割り', cost: { t: 'set', f: [1, 2, 3] }, fp: 4, type: 'phys',
      dmg: { base: 14, scale: { str: 0.6 } } },
  },
  halberd: {
    name: '番兵の斧槍', first: 4, inc: 3, maxChain: 2, type: 'phys',
    dmg: { base: 8, scale: { str: 0.4 } },
    cut: { phys: 0.4, magic: 0.1 },
    art: { name: '薙ぎ払い', cost: { t: 'face', f: [2, 4, 6] }, fp: 3, type: 'phys',
      dmg: { base: 12, scale: { str: 0.5 } } },
  },
};

export const SHIELDS: Record<string, Shield> = {
  kite: { name: '紋章の中盾', cut: { phys: 1, magic: 0.4 } },
};
