import { CARDS } from '../data/cards';
import { CLASSES, STAT_ORDER } from '../data/classes';
import { ARMORS, SHIELDS, WEAPONS } from '../data/equipment';
import { FIXED_CATACOMBS } from '../data/fixed';
import { ABYSS_KEYS } from '../data/abyss';
import { ACCESSORIES } from '../data/accessories';
import { CATACOMBS } from '../data/catacombs';
import { RULES } from '../data/rules';
import {
  classKit, inventoryOf, mergeInventory, newId, zeroStats, type Character, type Equip, type EquipSlot, type Inventory,
} from './model';

/** 保存形式のバージョン。形式を変えたら上げて、migrate に変換を足す。 */
export const SAVE_VERSION = 4;
export const STORAGE_KEY = 'cinder_duel.save';

export interface SaveData {
  version: number;
  characters: Character[];
}

export const emptySave = (): SaveData => ({ version: SAVE_VERSION, characters: [] });

/** 古い形式のデータを今の形式に直す */
function migrate(raw: { version?: unknown; characters?: unknown }): { characters: unknown[] } {
  const v = typeof raw.version === 'number' ? raw.version : 0;
  if (v > SAVE_VERSION) throw new Error('新しいバージョンのゲームで作られたデータです。ページを再読み込みしてください。');
  // v1 → v2: 持ち物とソウルが増えた。持ち物がないキャラは sanitizeCharacter で
  //          「素性の初期装備・カード＋いま装備しているもの・デッキに入っているもの」を持っていることにする
  // v2 → v3: 作成時のレベル（freeLevels）を持つようになった。v2 までのキャラは作成時に30レベルもらっていた
  // v3 → v4: アクセサリ（accessories）と、地下墓ごとの踏破した周回（cycles）が増えた。どちらも空で始まる（sanitizeCharacter で補う）
  const list = Array.isArray(raw.characters) ? raw.characters : [];
  const characters = v < 3
    ? list.map((c) => (c && typeof c === 'object' && !('freeLevels' in c) ? { ...c, freeLevels: RULES.legacyFreeLevels } : c))
    : list;
  return { characters };
}

const SLOTS: EquipSlot[] = ['right', 'left', 'head', 'chest', 'arms', 'legs'];

function validItem(slot: EquipSlot, id: unknown): string | null {
  if (typeof id !== 'string') return null;
  if (slot === 'right') return WEAPONS[id] ? id : null;
  if (slot === 'left') return SHIELDS[id] || WEAPONS[id]?.kind === 'catalyst' || WEAPONS[id]?.school ? id : null;
  return ARMORS[id]?.slot === slot ? id : null;
}

/** 読み込んだ1人分を検査して整える。直せないものは null */
export function sanitizeCharacter(raw: unknown): Character | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.classId !== 'string' || !CLASSES[r.classId]) return null;
  const alloc = zeroStats();
  const ra = (r.alloc ?? {}) as Record<string, unknown>;
  for (const k of STAT_ORDER) {
    const n = Number(ra[k]);
    alloc[k] = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }
  const lost = Math.max(0, Math.floor(Number(r.lostLevels) || 0));
  const bought = Math.max(0, Math.floor(Number(r.boughtLevels) || 0));
  // 書いていないのは古い形式のキャラ（アカウントに古い版で保存されたものなど）なので、作成時の30レベルを持たせる
  const free = typeof r.freeLevels === 'number' && Number.isFinite(r.freeLevels)
    ? Math.min(RULES.legacyFreeLevels, Math.max(0, Math.floor(r.freeLevels)))
    : RULES.legacyFreeLevels;
  // 振れる上限を超えた不正なデータは振り直し扱いにする
  if (STAT_ORDER.reduce((a, k) => a + alloc[k], 0) > Math.max(0, free + bought - lost)) for (const k of STAT_ORDER) alloc[k] = 0;
  const re = (r.equip ?? {}) as Record<string, unknown>;
  const equip = {} as Equip;
  for (const s of SLOTS) equip[s] = validItem(s, re[s]);
  const deck = Array.isArray(r.deck) ? r.deck.filter((x): x is string => typeof x === 'string' && !!CARDS[x]) : [];
  const inventory = r.inventory && typeof r.inventory === 'object'
    ? sanitizeInventory(r.inventory as Record<string, unknown>)
    : mergeInventory(classKit(r.classId), inventoryOf(equip, deck));
  const souls = Number(r.souls);
  const now = Date.now();
  return {
    id: typeof r.id === 'string' && r.id ? r.id : newId(),
    name: typeof r.name === 'string' && r.name.trim() ? r.name.slice(0, 24) : CLASSES[r.classId].name,
    classId: r.classId,
    alloc,
    equip,
    deck,
    inventory,
    souls: Number.isFinite(souls) && souls > 0 ? Math.floor(souls) : 0,
    freeLevels: free,
    lostLevels: lost,
    boughtLevels: bought,
    clues: Array.isArray(r.clues) ? [...new Set(r.clues.filter((x): x is string => typeof x === 'string' && !!FIXED_CATACOMBS[x]))] : [],
    accessories: Array.isArray(r.accessories)
      ? [...new Set(r.accessories.filter((x): x is string => typeof x === 'string' && !!ACCESSORIES[x] && inventory.items.includes(x)))].slice(0, RULES.accessorySlots)
      : [],
    cycles: sanitizeCycles(r.cycles),
    abyssCleared: Array.isArray(r.abyssCleared) ? [...new Set(r.abyssCleared.filter((x): x is string => typeof x === 'string' && ABYSS_KEYS.includes(x)))] : [],
    createdAt: typeof r.createdAt === 'number' ? r.createdAt : now,
    updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : now,
  };
}

const isItem = (id: string) => !!(WEAPONS[id] || SHIELDS[id] || ARMORS[id] || ACCESSORIES[id]);

function sanitizeCycles(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = Math.floor(Number(v));
    if (CATACOMBS[k] && Number.isFinite(n) && n > 0) out[k] = Math.min(n, 99);
  }
  return out;
}

function sanitizeInventory(r: Record<string, unknown>): Inventory {
  const items = Array.isArray(r.items) ? [...new Set(r.items.filter((x): x is string => typeof x === 'string' && isItem(x)))] : [];
  const cards: Record<string, number> = {};
  const rc = (r.cards ?? {}) as Record<string, unknown>;
  for (const [id, n] of Object.entries(rc)) {
    const k = Math.floor(Number(n));
    if (CARDS[id] && Number.isFinite(k) && k > 0) cards[id] = Math.min(k, 99);
  }
  return { items, cards };
}

export function parseSave(text: string): SaveData {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('ファイルを読み取れませんでした。書き出したセーブファイルを選んでください。');
  }
  if (!raw || typeof raw !== 'object') throw new Error('セーブファイルの形式が違います。');
  const m = migrate(raw as { version?: unknown; characters?: unknown });
  const characters = m.characters.map(sanitizeCharacter).filter((c): c is Character => !!c);
  return { version: SAVE_VERSION, characters };
}

export const serializeSave = (s: SaveData): string => JSON.stringify(s, null, 2);

/** 読み込んだキャラを今のデータに足す。同じIDは別キャラとして追加する。 */
export function mergeSave(current: SaveData, incoming: SaveData): { save: SaveData; added: number } {
  const ids = new Set(current.characters.map((c) => c.id));
  const added = incoming.characters.map((c) => (ids.has(c.id) ? { ...c, id: newId() } : c));
  return { save: { version: SAVE_VERSION, characters: [...current.characters, ...added] }, added: added.length };
}

/* ---------------- ブラウザの保存領域 ---------------- */

export function loadSave(storage: Storage | null = safeStorage()): SaveData {
  try {
    const text = storage?.getItem(STORAGE_KEY);
    return text ? parseSave(text) : emptySave();
  } catch {
    return emptySave();
  }
}

/** 保存に失敗したら false */
export function writeSave(s: SaveData, storage: Storage | null = safeStorage()): boolean {
  try {
    if (!storage) return false;
    storage.setItem(STORAGE_KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}

function safeStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
