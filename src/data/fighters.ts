import type { FighterDef, StatKey } from '../engine/types';

export const STAT_NAMES: Record<StatKey, string> = {
  vit: '生命力', att: '精神', end: '持久', str: '筋力',
  dex: '技量', int: '知力', fai: '信仰', arc: '神秘',
};

export const CLASSES: Record<string, FighterDef> = {
  knight: {
    name: '放浪の騎士', blurb: '直剣と中盾。物理を盾で受け止め、隙に二段斬りを返す。',
    weapon: 'sword', shield: 'kite', weight: 'medium',
    stats: { vit: 12, att: 8, end: 12, str: 12, dex: 11, int: 8, fai: 10, arc: 7 },
  },
  thief: {
    name: '灰街の盗賊', blurb: '軽い短剣で三段まで刻む。回避が安いぶん、受けは脆い。',
    weapon: 'dagger', shield: null, weight: 'light',
    stats: { vit: 10, att: 10, end: 14, str: 9, dex: 15, int: 10, fai: 8, arc: 11 },
  },
  warrior: {
    name: '鉄塊の戦士', blurb: '重い一撃に賭ける。回避は高くつくが、鎧が硬い。',
    weapon: 'greatsword', shield: null, weight: 'heavy',
    stats: { vit: 14, att: 6, end: 11, str: 16, dex: 9, int: 7, fai: 8, arc: 6 },
  },
};

export const ENEMIES: Record<string, FighterDef> = {
  sentinel: {
    name: '灰の番兵', weapon: 'halberd', shield: null, weight: 'medium',
    stats: { vit: 25, att: 9, end: 12, str: 16, dex: 10, int: 6, fai: 6, arc: 6 },
  },
};
