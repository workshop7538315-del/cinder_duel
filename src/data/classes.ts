import type { StatKey, Stats } from '../engine/types';
import type { Equip } from '../character/model';

export const STAT_NAMES: Record<StatKey, string> = {
  vit: '生命力', att: '精神', end: '持久', str: '筋力',
  dex: '技量', int: '知力', fai: '信仰', arc: '神秘',
};
export const STAT_ORDER: StatKey[] = ['vit', 'att', 'end', 'str', 'dex', 'int', 'fai', 'arc'];

export interface ClassDef {
  name: string;
  level: number;
  stats: Stats;
  /** 作成時の初期装備（後から自由に変えられる） */
  equip: Equip;
}

const s = (vit: number, att: number, end: number, str: number, dex: number, int: number, fai: number, arc: number): Stats =>
  ({ vit, att, end, str, dex, int, fai, arc });

/** 素性（能力値はエルデンリングの初期素性と同じ。レベル = 能力値の合計 − 79） */
export const CLASSES: Record<string, ClassDef> = {
  vagabond: {
    name: '放浪騎士', level: 9, stats: s(15, 10, 11, 14, 13, 9, 9, 7),
    equip: { right: 'longsword', left: 'heater', head: 'knight_helm', chest: 'knight_armor', arms: 'knight_gauntlets', legs: 'knight_greaves' },
  },
  warrior: {
    name: '戦士', level: 8, stats: s(11, 12, 11, 10, 16, 10, 8, 9),
    equip: { right: 'katana', left: null, head: 'travel_hood', chest: 'travel_coat', arms: 'travel_gloves', legs: 'travel_boots' },
  },
  hero: {
    name: '勇者', level: 7, stats: s(14, 9, 12, 16, 9, 7, 8, 11),
    equip: { right: 'battleaxe', left: 'buckler', head: null, chest: 'knight_armor', arms: 'travel_gloves', legs: 'travel_boots' },
  },
  bandit: {
    name: '盗賊', level: 5, stats: s(10, 11, 10, 9, 13, 9, 8, 14),
    equip: { right: 'dagger', left: 'buckler', head: 'travel_hood', chest: 'travel_coat', arms: 'travel_gloves', legs: 'travel_boots' },
  },
  astrologer: {
    name: '星見', level: 6, stats: s(9, 15, 9, 8, 12, 16, 7, 9),
    equip: { right: 'dagger', left: 'novice_staff', head: 'sage_hood', chest: 'sage_robe', arms: 'travel_gloves', legs: 'sage_trousers' },
  },
  prophet: {
    name: '預言者', level: 7, stats: s(10, 14, 8, 11, 10, 7, 16, 10),
    equip: { right: 'longsword', left: 'prayer_seal', head: 'sage_hood', chest: 'sage_robe', arms: 'travel_gloves', legs: 'sage_trousers' },
  },
  samurai: {
    name: '侍', level: 9, stats: s(12, 11, 13, 12, 15, 9, 8, 8),
    equip: { right: 'katana', left: 'buckler', head: 'knight_helm', chest: 'travel_coat', arms: 'knight_gauntlets', legs: 'travel_boots' },
  },
  prisoner: {
    name: '囚人', level: 9, stats: s(11, 12, 11, 11, 14, 14, 6, 9),
    equip: { right: 'longsword', left: 'novice_staff', head: 'iron_helm', chest: 'travel_coat', arms: 'travel_gloves', legs: 'travel_boots' },
  },
  confessor: {
    name: '密使', level: 10, stats: s(10, 13, 10, 12, 12, 9, 14, 9),
    equip: { right: 'longsword', left: 'prayer_seal', head: 'travel_hood', chest: 'knight_armor', arms: 'travel_gloves', legs: 'travel_boots' },
  },
  wretch: {
    name: '素寒貧', level: 1, stats: s(10, 10, 10, 10, 10, 10, 10, 10),
    equip: { right: 'longsword', left: null, head: null, chest: null, arms: null, legs: null },
  },
};
