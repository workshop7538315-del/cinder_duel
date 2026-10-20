import { AUTO_DECK_PRIORITY, CARDS } from '../data/cards';
import { CLASSES, STAT_NAMES, STAT_ORDER } from '../data/classes';
import { ACCESSORIES } from '../data/accessories';
import { ARMORS, FISTS, SHIELDS, WEAPONS, WEIGHTS } from '../data/equipment';
import { RULES } from '../data/rules';
import { reqLabel } from '../engine/format';
import { derive, levelCost, levelOf, meetsReq, unmetReq, weightKey } from '../engine/stats';
import type { Accessory, ArmorSlot, Behavior, Crystal, CrystalKey, Mods, Cut, HandItem, School, StatKey, Stats, Weapon, WeightClass } from '../engine/types';

export type EquipSlot = 'right' | 'left' | ArmorSlot;
export type Equip = Record<EquipSlot, string | null>;

/** 持ち物。装備とカードは持っているものしか使えない */
export interface Inventory {
  /** 持っている装備のID（同じものは1つで足りる） */
  items: string[];
  /** 持っているカードの枚数 */
  cards: Record<string, number>;
  /** 持っている淵結晶 */
  crystals?: Crystal[];
}

/** 保存されるキャラクター */
export interface Character {
  id: string;
  name: string;
  classId: string;
  /** 素性の初期値に上乗せした分（レベルアップで振った分） */
  alloc: Stats;
  equip: Equip;
  /** カードIDの並び（同名は複数入る） */
  deck: string[];
  inventory: Inventory;
  /** 持っているソウル */
  souls: number;
  /** 底の武器にはめた淵結晶（武器ID → 穴ごとの淵結晶の uid） */
  sockets?: Record<string, (string | null)[]>;
  /** 身につけているアクセサリ（指輪・タリスマン）。4つまで */
  accessories?: string[];
  /** 地下墓ごとに、踏破した周回の最高（CATACOMBS のキー → 周回） */
  cycles?: Record<string, number>;
  /** 強敵・主の動き方（あるとパターンで動く。保存はしない） */
  behavior?: Behavior;
  /** 強敵か主か（behavior とあわせて使う） */
  foeRank?: '強敵' | '主';
  /** NPC（地下墓の敵・練習試合の相手）。装備条件を無視して装備を使いこなす（保存はしない） */
  npc?: boolean;
  /** 知っている困難な地下墓（FIXED_CATACOMBS のキー）。手がかりで覚える */
  clues?: string[];
  /** 踏破した底（ABYSS_KEYS のどれか）。踏破した底には、入口から直接入れる */
  abyssCleared?: string[];
  /** 作成時にもらったレベル。新しいキャラは RULES.levelBudget（0）、v0.15 までのキャラは 30 */
  freeLevels?: number;
  /** 失ったレベル（底から脱出したとき、呪死したとき）。この分だけ振れるレベルが減る */
  lostLevels?: number;
  /** ソウルで上げたレベル。この分だけ振れるレベルが増える */
  boughtLevels?: number;
  createdAt: number;
  updatedAt: number;
}

export const zeroStats = (): Stats => ({ vit: 0, att: 0, end: 0, str: 0, dex: 0, int: 0, fai: 0, arc: 0 });
export const allocTotal = (a: Stats): number => STAT_ORDER.reduce((n, k) => n + a[k], 0);

export function newId(): string {
  const c = globalThis.crypto;
  if (c && 'randomUUID' in c) return c.randomUUID();
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function charStats(c: Pick<Character, 'classId' | 'alloc'>): Stats {
  const base = CLASSES[c.classId].stats;
  const out = { ...base };
  for (const k of STAT_ORDER) out[k] = base[k] + (c.alloc[k] ?? 0);
  return out;
}
export const charLevel = (c: Pick<Character, 'classId' | 'alloc'>): number => levelOf(charStats(c));

/* ---------------- 装備 ---------------- */

export const rightItem = (e: Equip): Weapon => (e.right && WEAPONS[e.right]) || FISTS;
export function leftItem(e: Equip): HandItem | null {
  if (!e.left) return null;
  return SHIELDS[e.left] ?? WEAPONS[e.left] ?? null;
}
const armorItems = (e: Equip) =>
  (['head', 'chest', 'arms', 'legs'] as const).map((s) => (e[s] ? ARMORS[e[s]!] : null)).filter((a) => !!a);

export function equipWeight(e: Equip): number {
  const w = rightItem(e).weight + (leftItem(e)?.weight ?? 0) + armorItems(e).reduce((a, x) => a + x.weight, 0);
  return Math.round(w * 10) / 10;
}

export function armorCut(e: Equip): Cut {
  const out: Cut = { phys: 0, magic: 0, holy: 0 };
  for (const a of armorItems(e)) for (const k of Object.keys(out) as (keyof Cut)[]) out[k] += a.cut[k];
  for (const k of Object.keys(out) as (keyof Cut)[]) out[k] = Math.round(out[k] * 100) / 100;
  return out;
}

export interface Loadout {
  stats: Stats;
  level: number;
  right: Weapon;
  left: HandItem | null;
  rightOk: boolean;
  leftOk: boolean;
  weight: number;
  equipLoad: number;
  ratio: number;
  weightClass: WeightClass;
  armorCut: Cut;
  schools: School[];
  derived: ReturnType<typeof derive>;
  accessories: Accessory[];
  /** アクセサリ・淵結晶による戦闘中の効果 */
  acc: Mods;
  /** 装備している武器にはまっている淵結晶 */
  crystals: Crystal[];
}

/** 武器にはまっている淵結晶（持っていないもの・知らないものは除く） */
export function socketedCrystals(c: Partial<Pick<Character, 'inventory' | 'sockets'>>, weaponId: string | null): Crystal[] {
  if (!weaponId) return [];
  const slots = WEAPONS[weaponId]?.sockets ?? 0;
  const owned = c.inventory?.crystals ?? [];
  return (c.sockets?.[weaponId] ?? []).slice(0, slots)
    .map((uid) => owned.find((x) => x.uid === uid)).filter((x): x is Crystal => !!x);
}

/** 淵結晶の効果の合計（マイナスは引く） */
export function crystalTotals(list: Crystal[]): Record<CrystalKey, number> {
  const t = { atk: 0, art: 0, spell: 0, bleed: 0, curse: 0, hp: 0, fp: 0, cut: 0, guard: 0, stMax: 0 } as Record<CrystalKey, number>;
  for (const x of list) {
    t[x.plus.key] += x.plus.value;
    if (x.minus) t[x.minus.key] -= x.minus.value;
  }
  return t;
}

/** 身につけているアクセサリ（知らないIDと重複は除く） */
export const accessoryItems = (ids: string[] | undefined): Accessory[] =>
  [...new Set(ids ?? [])].slice(0, RULES.accessorySlots).map((id) => ACCESSORIES[id]).filter((a): a is Accessory => !!a);

export function loadout(c: Pick<Character, 'classId' | 'alloc' | 'equip' | 'npc' | 'accessories'> & Partial<Pick<Character, 'inventory' | 'sockets'>>): Loadout {
  const base = charStats(c);
  const accs = accessoryItems(c.accessories);
  // アクセサリの能力値は、装備条件と補正に効くがレベルには数えない
  const stats = { ...base };
  for (const a of accs) for (const [k, v] of Object.entries(a.effect.stats ?? {}) as [StatKey, number][]) stats[k] = Math.min(RULES.statMax, stats[k] + v);
  const d0 = derive(stats);
  const sum = (f: (a: Accessory) => number | undefined) => accs.reduce((n, a) => n + (f(a) ?? 0), 0);
  // 両手の武器にはまっている淵結晶
  const crystals = [...socketedCrystals(c, c.equip.right), ...(c.equip.left !== c.equip.right ? socketedCrystals(c, c.equip.left) : [])];
  const ct = crystalTotals(crystals);
  const stMax = Math.max(1, d0.stMax + ct.stMax);
  const derived = {
    ...d0,
    maxHp: Math.max(1, Math.floor(d0.maxHp * (1 + sum((a) => a.effect.hpPct) + ct.hp))),
    maxFp: Math.max(0, d0.maxFp + sum((a) => a.effect.fp) + ct.fp),
    stMax,
    stInit: Math.min(stMax, d0.stInit + sum((a) => a.effect.stInit)),
  };
  const right = rightItem(c.equip);
  const left = leftItem(c.equip);
  const weight = Math.round((equipWeight(c.equip) + sum((a) => a.weight)) * 10) / 10;
  const ratio = weight / derived.equipLoad;
  const schools = [right, left].flatMap((x) => (x && x.kind !== 'shield' && x.school ? [x.school] : []));
  return {
    stats, level: levelOf(base), right, left,
    rightOk: !!c.npc || meetsReq(right.req, stats),
    leftOk: !left || !!c.npc || meetsReq(left.req, stats),
    weight, equipLoad: derived.equipLoad, ratio,
    weightClass: WEIGHTS[weightKey(ratio)],
    armorCut: crystalCut(addCut(armorCut(c.equip), accs), ct.cut),
    schools, derived,
    accessories: accs,
    acc: {
      guardDiscount: sum((a) => a.effect.guardDiscount) + ct.guard, healPct: sum((a) => a.effect.healPct), bleedPct: sum((a) => a.effect.bleedPct),
      atkPct: ct.atk, artPct: ct.art, spellPct: ct.spell + sum((a) => a.effect.spellPct), bleedAdd: ct.bleed, curseAdd: ct.curse,
      drawOnDiscard: armorItems(c.equip).reduce((n, a) => n + (a.effect?.drawOnDiscard ?? 0), 0),
    },
    crystals,
  };
}

/** 淵結晶のカット率（全属性に足す。0〜0.95 に収める） */
function crystalCut(cut: Cut, v: number): Cut {
  if (!v) return cut;
  const f = (x: number) => Math.round(Math.min(0.95, Math.max(0, x + v)) * 100) / 100;
  return { phys: f(cut.phys), magic: f(cut.magic), holy: f(cut.holy) };
}

function addCut(cut: Cut, accs: Accessory[]): Cut {
  const out = { ...cut };
  for (const a of accs) for (const [k, v] of Object.entries(a.effect.cut ?? {}) as [keyof Cut, number][]) out[k] = Math.round((out[k] + v) * 100) / 100;
  return out;
}

/* ---------------- デッキ ---------------- */

export function countCards(deck: string[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const id of deck) m[id] = (m[id] ?? 0) + 1;
  return m;
}

/** そのカードをデッキに入れられない理由（入れられるなら null） */
export function cardBlock(id: string, stats: Stats, schools: School[], right?: Weapon): string | null {
  const c = CARDS[id];
  if (!c) return '存在しないカード';
  if (c.enchant && right?.noEnchant) return `${right.name}はエンチャントできない`;
  if (c.req && !meetsReq(c.req, stats)) return `${reqLabel(c.req)}が必要`;
  if (c.school && !schools.includes(c.school)) return c.school === 'sorcery' ? '杖が必要' : '聖印かタリスマンが必要';
  return null;
}

/** 能力値と装備から、使えるカードで自動的にデッキを組む（owned を渡すと持っている枚数まで） */
export function autoDeck(stats: Stats, schools: School[], right?: Weapon, owned?: Record<string, number>, size = 15): string[] {
  const deck: string[] = [];
  const limit = (id: string) => Math.min(RULES.copyLimit, owned ? owned[id] ?? 0 : RULES.copyLimit);
  const add = (id: string, n: number, upTo: number) => {
    if (cardBlock(id, stats, schools, right)) return;
    const have = deck.filter((x) => x === id).length;
    for (let i = have; i < Math.min(n, limit(id)) && deck.length < upTo; i++) deck.push(id);
  };
  for (const [id, n] of AUTO_DECK_PRIORITY) add(id, n, size);
  // 足りなければ条件なしのカードで埋める
  for (const id of ['kick', 'stance', 'breath', 'insight', 'oil', 'flask', 'knife']) add(id, RULES.copyLimit, RULES.deckMin);
  // それでも足りなければ、持っているカードを何でも
  if (owned) for (const id of Object.keys(owned)) add(id, RULES.copyLimit, RULES.deckMin);
  return deck;
}

/* ---------------- 持ち物 ---------------- */

const equipIds = (e: Equip): string[] => Object.values(e).filter((x): x is string => !!x);

/** 素性の初期装備と初期カード（素性の初期能力値で使えるもの） */
export function classKit(classId: string): Inventory {
  const cls = CLASSES[classId];
  const base = { classId, alloc: zeroStats(), equip: cls.equip };
  const lo = loadout(base);
  return { items: equipIds(cls.equip), cards: countCards(autoDeck(lo.stats, lo.schools, lo.right)) };
}

/** 装備とデッキをそのまま持ち物にする（敵やプリセット用） */
export const inventoryOf = (equip: Equip, deck: string[]): Inventory => ({ items: equipIds(equip), cards: countCards(deck) });

/** 2つの持ち物を合わせる（カードは多い方の枚数） */
export function mergeInventory(a: Inventory, b: Inventory): Inventory {
  const cards = { ...a.cards };
  for (const [id, n] of Object.entries(b.cards)) cards[id] = Math.max(cards[id] ?? 0, n);
  return { items: [...new Set([...a.items, ...b.items])], cards };
}

/** 装備・アクセサリの名前 */
export const itemName = (id: string): string => (WEAPONS[id] ?? SHIELDS[id] ?? ARMORS[id] ?? ACCESSORIES[id])?.name ?? id;

export const ownsItem = (c: Character, id: string): boolean => c.inventory.items.includes(id);
export const ownedCards = (c: Character, id: string): number => c.inventory.cards[id] ?? 0;
const deckFromCounts = (m: Record<string, number>): string[] => Object.entries(m).flatMap(([id, n]) => Array(n).fill(id));

/* ---------------- 作成と検証 ---------------- */

export function newCharacter(classId: string, name?: string): Character {
  const cls = CLASSES[classId];
  const now = Date.now();
  const inventory = { ...classKit(classId), crystals: [] };
  return {
    id: newId(), name: name ?? cls.name, classId,
    alloc: zeroStats(), equip: { ...cls.equip }, deck: deckFromCounts(inventory.cards),
    inventory, souls: 0, clues: [], abyssCleared: [], accessories: [], cycles: {}, sockets: {}, freeLevels: RULES.levelBudget, lostLevels: 0, boughtLevels: 0, createdAt: now, updatedAt: now,
  };
}

/** 振れるレベルの上限（作成時にもらった分 ＋ ソウルで上げた分 − 失った分） */
export const levelBudget = (c: Pick<Character, 'freeLevels' | 'lostLevels' | 'boughtLevels'>): number =>
  Math.max(0, (c.freeLevels ?? RULES.legacyFreeLevels) + (c.boughtLevels ?? 0) - (c.lostLevels ?? 0));

/** いちばん高い能力値（振った分があるもの）から n だけ下げる */
function reduceAlloc(c: Character, n: number, allowNegative: boolean): Stats {
  const alloc = { ...c.alloc };
  for (let i = 0; i < n; i++) {
    const stats = charStats({ classId: c.classId, alloc });
    const pool = STAT_ORDER.filter((k) => allowNegative || alloc[k] > 0);
    if (!pool.length) break;
    const k = pool.reduce((a, b) => (stats[b] > stats[a] ? b : a));
    alloc[k] -= 1;
  }
  return alloc;
}

/** レベルを失う（振った能力値が高いものから減り、振れる上限も減る） */
export function loseLevels(c: Character, n: number): Character {
  const lostLevels = (c.lostLevels ?? 0) + n;
  const over = Math.max(0, allocTotal(c.alloc) - levelBudget({ ...c, lostLevels }));
  return { ...c, lostLevels, alloc: reduceAlloc(c, over, false), updatedAt: Date.now() };
}


/** ソウルでレベルを1上げられるか（振れるポイントが残っていないとき） */
export function canBuyLevel(c: Character): boolean {
  return c.souls >= levelCost(charLevel(c));
}

/** ソウルを払ってレベルを1上げる（振れる上限が1増える） */
export function buyLevel(c: Character): Character {
  const cost = levelCost(charLevel(c));
  if (c.souls < cost) return c;
  return { ...c, souls: c.souls - cost, boughtLevels: (c.boughtLevels ?? 0) + 1 };
}

/** 篝火で能力値を1上げる。振れるポイントが残っていればそれを使い、なければソウルを払う。
 *  ソウルは持ち歩いている分（carried。地下墓で拾ったまだ持ち帰っていないもの）から先に払い、足りなければ貯めた分から払う。
 *  上げられなければ null */
export function levelUpAtBonfire(c: Character, stat: StatKey, carried: number): { character: Character; carried: number } | null {
  if (charStats(c)[stat] >= RULES.statMax) return null;
  const alloc = { ...c.alloc, [stat]: c.alloc[stat] + 1 };
  if (allocTotal(c.alloc) < levelBudget(c)) return { character: { ...c, alloc, updatedAt: Date.now() }, carried };
  const cost = levelCost(charLevel(c));
  if (carried + c.souls < cost) return null;
  const fromCarried = Math.min(carried, cost);
  return {
    character: { ...c, alloc, souls: c.souls - (cost - fromCarried), boughtLevels: (c.boughtLevels ?? 0) + 1, updatedAt: Date.now() },
    carried: carried - fromCarried,
  };
}

export interface Issues {
  /** 保存できない問題 */
  errors: string[];
  /** 保存はできるが不利になる点 */
  warnings: string[];
}

export interface CheckOptions {
  /** 保存済みのキャラは、振った能力値をこれより下げられない */
  minAlloc?: Stats;
  /** プリセットの敵はレベルアップの上限を見ない */
  ignoreBudget?: boolean;
}

export function checkCharacter(c: Character, opts: CheckOptions = {}): Issues {
  const { minAlloc, ignoreBudget } = opts;
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!CLASSES[c.classId]) return { errors: ['素性が不明です。'], warnings };
  if (!c.name.trim()) errors.push('名前を入れてください。');

  const total = allocTotal(c.alloc);
  if (!ignoreBudget && total > levelBudget(c)) errors.push(`振れるのは${levelBudget(c)}レベルまでです（今は${total}）。`);
  const stats = charStats(c);
  for (const k of STAT_ORDER) {
    if (c.alloc[k] < 0) errors.push(`${STAT_NAMES[k]}は素性の初期値より下げられません。`);
    if (minAlloc && c.alloc[k] < minAlloc[k]) errors.push(`${STAT_NAMES[k]}は保存後に下げられません。`);
    if (stats[k] > RULES.statMax) errors.push(`${STAT_NAMES[k]}は${RULES.statMax}までです。`);
  }

  const lo = loadout(c);
  if (c.equip.left && WEAPONS[c.equip.left]?.kind === 'weapon' && !WEAPONS[c.equip.left]?.school) errors.push('左手には盾か触媒（触媒を兼ねる武器を含む）しか持てません。');
  for (const id of equipIds(c.equip)) {
    if (!ownsItem(c, id)) errors.push(`「${itemName(id)}」を持っていません。`);
  }
  const accs = c.accessories ?? [];
  if (accs.length > RULES.accessorySlots) errors.push(`アクセサリは${RULES.accessorySlots}つまでです。`);
  if (new Set(accs).size !== accs.length) errors.push('同じアクセサリは1つしか身につけられません。');
  for (const id of accs) {
    if (!ACCESSORIES[id]) errors.push('不明なアクセサリを身につけています。');
    else if (!ownsItem(c, id)) errors.push(`「${ACCESSORIES[id].name}」を持っていません。`);
  }
  const miss = (item: { name: string; req: Partial<Record<string, number>> }) =>
    unmetReq(item.req, lo.stats).map(([k, v]) => `${STAT_NAMES[k as StatKey]}${v}`).join('・');
  if (!lo.rightOk) warnings.push(`${lo.right.name}は能力不足（${miss(lo.right)}が必要）。攻撃力が下がり、補正も効きません。`);
  if (lo.left && !lo.leftOk) warnings.push(`${lo.left.name}は能力不足（${miss(lo.left)}が必要）。性能が下がります。`);
  if (lo.weightClass.key === 'over') warnings.push('装備重量が上限を超えています。回避ができません。');

  const n = c.deck.length;
  if (n < RULES.deckMin || n > RULES.deckMax) errors.push(`デッキは${RULES.deckMin}〜${RULES.deckMax}枚です（今は${n}枚）。`);
  for (const [id, k] of Object.entries(countCards(c.deck))) {
    const card = CARDS[id];
    if (!card) {
      errors.push('不明なカードが入っています。');
      continue;
    }
    if (k > RULES.copyLimit) errors.push(`「${card.name}」は${RULES.copyLimit}枚までです。`);
    else if (k > ownedCards(c, id)) errors.push(`「${card.name}」は${ownedCards(c, id)}枚しか持っていません。`);
    const why = cardBlock(id, lo.stats, lo.schools, lo.right);
    if (why) errors.push(why.endsWith('が必要') ? `「${card.name}」を使うには${why}です。` : `「${card.name}」は使えません（${why}）。`);
  }
  return { errors, warnings };
}

/** 決めた比率で能力値を振る（プリセットの敵を作るとき用） */
export function autoAlloc(classId: string, level: number, focus: Partial<Record<StatKey, number>>): Stats {
  const base = CLASSES[classId].stats;
  const alloc = zeroStats();
  let points = Math.max(0, level - CLASSES[classId].level);
  const keys = STAT_ORDER.filter((k) => (focus[k] ?? 0) > 0);
  while (points > 0 && keys.length) {
    let best = keys[0];
    let bestScore = -Infinity;
    for (const k of keys) {
      if (base[k] + alloc[k] >= RULES.statMax) continue;
      const score = (focus[k] ?? 0) / (alloc[k] + 1);
      if (score > bestScore) {
        bestScore = score;
        best = k;
      }
    }
    alloc[best]++;
    points--;
  }
  return alloc;
}
