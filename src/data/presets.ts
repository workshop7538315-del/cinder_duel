import type { Equip } from '../character/model';
import type { StatKey } from '../engine/types';

export interface PresetDef {
  name: string;
  classId: string;
  level: number;
  /** レベルアップの振り方（比率） */
  focus: Partial<Record<StatKey, number>>;
  equip: Equip;
  /** 省略すると能力値と装備から自動で組む */
  deck?: string[];
  strong?: boolean;
}

const travel = { head: 'travel_hood', chest: 'travel_coat', arms: 'travel_gloves', legs: 'travel_boots' };
const sage = { head: 'sage_hood', chest: 'sage_robe', arms: 'travel_gloves', legs: 'sage_trousers' };
const knight = { head: 'knight_helm', chest: 'knight_armor', arms: 'knight_gauntlets', legs: 'knight_greaves' };
const iron = { head: 'iron_helm', chest: 'iron_armor', arms: 'iron_gauntlets', legs: 'iron_greaves' };
const naked = { head: null, chest: null, arms: null, legs: null };

export const PRESETS: Record<string, PresetDef> = {
  // ---- 通常 ----
  lost: {
    name: '迷い人', classId: 'wretch', level: 5, focus: { vit: 1, str: 1, dex: 1 },
    equip: { right: 'longsword', left: null, ...naked },
  },
  bandit: {
    name: '野盗', classId: 'bandit', level: 12, focus: { vit: 2, dex: 2, end: 1 },
    equip: { right: 'dagger', left: 'buckler', ...travel },
  },
  sentinel: {
    name: '灰の番兵', classId: 'hero', level: 22, focus: { vit: 3, str: 2, dex: 2, end: 1 },
    equip: { right: 'halberd', left: null, ...knight },
  },
  pilgrim: {
    name: '放浪の祈祷師', classId: 'prophet', level: 28, focus: { vit: 2, fai: 3, att: 1 },
    equip: { right: 'longsword', left: 'prayer_seal', ...sage },
  },
  graveblade: {
    name: '墓場の剣士', classId: 'samurai', level: 32, focus: { vit: 3, dex: 3, end: 2 },
    equip: { right: 'katana', left: 'buckler', ...travel },
  },
  sorcerer: {
    name: '呪われた魔術師', classId: 'astrologer', level: 38, focus: { vit: 2, int: 4, att: 1 },
    equip: { right: 'dagger', left: 'novice_staff', ...sage },
  },
  guard: {
    name: '鉄の衛兵', classId: 'vagabond', level: 46, focus: { vit: 3, str: 3, end: 3 },
    equip: { right: 'battleaxe', left: 'greatshield', ...iron },
  },
  veteran: {
    name: '古兵', classId: 'warrior', level: 55, focus: { vit: 3, dex: 3, end: 2, str: 1 },
    equip: { right: 'katana', left: 'heater', ...knight },
  },

  // ---- 強敵 ----
  redeye: {
    name: '赤目の狩人', classId: 'bandit', level: 16, strong: true, focus: { vit: 2, dex: 2, arc: 2 },
    equip: { right: 'dagger', left: null, ...travel },
  },
  twinblade: {
    name: '双刃の剣客', classId: 'samurai', level: 30, strong: true, focus: { vit: 3, dex: 4, end: 2 },
    equip: { right: 'katana', left: null, ...travel },
  },
  ashknight: {
    name: '灰の騎士長', classId: 'vagabond', level: 40, strong: true, focus: { vit: 3, str: 2, dex: 2, end: 2 },
    equip: { right: 'longsword', left: 'heater', ...knight },
  },
  priest: {
    name: 'タリスマンの司祭', classId: 'confessor', level: 46, strong: true, focus: { vit: 3, fai: 4, att: 2 },
    equip: { right: 'longsword', left: 'old_talisman', ...knight },
  },
  witch: {
    name: '星を見た魔女', classId: 'astrologer', level: 52, strong: true, focus: { vit: 3, int: 5, att: 2, end: 1 },
    equip: { right: 'dagger', left: 'star_staff', ...sage },
  },
  colossus: {
    name: '鉄塊の巨兵', classId: 'hero', level: 60, strong: true, focus: { vit: 4, str: 4, end: 3, dex: 1 },
    equip: { right: 'greatsword', left: null, ...iron },
  },
};
