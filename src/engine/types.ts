/** 能力値（エルデンリング準拠）。
 *  生命力=HP、精神=FP、持久=スタミナダイス。
 *  筋力・技量・知力・信仰・神秘はそれ自体に効果はなく、武器やカードの能力補正から参照される。 */
export type StatKey = 'vit' | 'att' | 'end' | 'str' | 'dex' | 'int' | 'fai' | 'arc';
export type Stats = Record<StatKey, number>;
export type ScaleStat = 'str' | 'dex' | 'int' | 'fai' | 'arc';
export type DamageType = 'phys' | 'magic';

/** 行動ダイスで払うコスト
 *  - sum : 合計 n 以上（お釣りなし）
 *  - face: 指定の目のダイス1個（[1の目]、[偶数の目] など）
 *  - set : 指定の目を1個ずつ（[1・2・3を1個ずつ] など） */
export type Cost =
  | { t: 'sum'; n: number }
  | { t: 'face'; f: number[] }
  | { t: 'set'; f: number[] };

/** 基礎値 + Σ(能力値 × 係数) */
export interface Scaling {
  base: number;
  scale: Partial<Record<ScaleStat, number>>;
}

export interface Die {
  id: number;
  v: number;
  fresh?: boolean;
}

export type WeightKey = 'light' | 'medium' | 'heavy';
export interface WeightClass {
  name: string;
  /** 速度 = nd6 の n */
  speedDice: number;
  /** 回避に必要な合計 */
  dodge: number;
  /** 物理ダメージの固定軽減 */
  armor: number;
}

export interface WeaponArt {
  name: string;
  cost: Cost;
  fp: number;
  dmg: Scaling;
  type: DamageType;
  unguardable?: boolean;
}

export interface Weapon {
  name: string;
  /** 一段目のコスト [first]、以降は inc ずつ重くなる */
  first: number;
  inc: number;
  maxChain: number;
  dmg: Scaling;
  type: DamageType;
  /** 受け能力（ガード時のカット率） */
  cut: Record<DamageType, number>;
  art: WeaponArt;
}

export interface Shield {
  name: string;
  cut: Record<DamageType, number>;
}

export interface FighterDef {
  name: string;
  blurb?: string;
  weapon: string;
  shield: string | null;
  weight: WeightKey;
  stats: Stats;
}

export interface Buffs {
  oil?: boolean;
  stance?: boolean;
  broken?: boolean;
}

export interface Fighter {
  name: string;
  isPlayer: boolean;
  stats: Stats;
  weapon: Weapon;
  shield: Shield | null;
  weight: WeightClass;
  maxHp: number;
  maxFp: number;
  stInit: number;
  stMax: number;
  hp: number;
  fp: number;
  stamina: number;
  speed: number;
  speedRoll: number[];
  /** 手番／リアクションで振った行動ダイス */
  action: Die[];
  hand: string[];
  deck: string[];
  discard: string[];
  /** この手番で何段目まで武器攻撃したか */
  chain: number;
  buffs: Buffs;
}

export interface Attack {
  label: string;
  dmg: number;
  type: DamageType;
  /** 武器由来（焼き油などが乗る） */
  weapon?: boolean;
  unguardable?: boolean;
  onHit?: (target: Fighter) => void;
}
