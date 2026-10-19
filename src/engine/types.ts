/** 能力値（エルデンリング準拠）。
 *  生命力=HP、精神=FP、持久=スタミナダイスと装備重量。
 *  筋力・技量・知力・信仰・神秘はそれ自体に効果はなく、装備条件と能力補正から参照される。 */
export type StatKey = 'vit' | 'att' | 'end' | 'str' | 'dex' | 'int' | 'fai' | 'arc';
export type Stats = Record<StatKey, number>;
export type ScaleStat = 'str' | 'dex' | 'int' | 'fai' | 'arc';
export type Requirements = Partial<Record<ScaleStat, number>>;

export type DamageType = 'phys' | 'magic' | 'holy';
export type Cut = Record<DamageType, number>;

/** 魔術（杖）と祈祷（聖印・タリスマン） */
export type School = 'sorcery' | 'incant';

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

export type WeightKey = 'light' | 'medium' | 'heavy' | 'over';
export interface WeightClass {
  key: WeightKey;
  name: string;
  /** 速度 = nd6 の n */
  speedDice: number;
  /** 回避に必要な合計（null なら回避できない） */
  dodge: number | null;
}

export interface WeaponArt {
  name: string;
  cost: Cost;
  fp: number;
  dmg: Scaling;
  type: DamageType;
  unguardable?: boolean;
  /** 出血の蓄積 */
  bleed?: Scaling;
  /** 呪死の蓄積（溜まりきると即死） */
  curse?: number;
  /** 当たると相手のレベルを1下げる */
  drain?: boolean;
  /** あると、自分の手番には使えないリアクション専用の戦技になる。
   *  回避として使い、そのあと相手が攻撃以外の行動をしたら counterCost を追加で払って反撃できる */
  reaction?: { counterCost: Cost };
}

interface ItemBase {
  name: string;
  weight: number;
  req: Requirements;
}

/** 片手に持つ武器。触媒（杖・聖印・タリスマン）も武器として殴れる。 */
export interface Weapon extends ItemBase {
  kind: 'weapon' | 'catalyst';
  /** 一段目のコスト [first]、以降は inc ずつ重くなる */
  first: number;
  inc: number;
  maxChain: number;
  dmg: Scaling;
  type: DamageType;
  /** 受け能力（ガード時のカット率） */
  cut: Cut;
  /** 当てるたびに溜まる出血（神秘で伸ばすのが基本） */
  bleed?: Scaling;
  /** エンチャント（焼き油・刃の祝福など）を受け付けない */
  noEnchant?: boolean;
  /** 呪死の蓄積（バジリスクなど） */
  curse?: number;
  /** 地下墓で手に入らない、敵だけが使う武器 */
  natural?: boolean;
  art?: WeaponArt;
  /** 触媒のみ: 対応する系統と、魔術・祈祷に上乗せする威力 */
  school?: School;
  power?: Scaling;
}

export interface Shield extends ItemBase {
  kind: 'shield';
  cut: Cut;
  /** ガード消費を軽くする（大盾など） */
  guardBonus?: number;
}

export type HandItem = Weapon | Shield;

export type ArmorSlot = 'head' | 'chest' | 'arms' | 'legs';
export interface Armor {
  name: string;
  slot: ArmorSlot;
  weight: number;
  /** 被ダメージのカット率（部位の合計を使う） */
  cut: Cut;
}

/** 武器へのエンチャント。重ね掛けはできず、新しく掛けると前のものは消える */
export interface Enchant {
  name: string;
  /** 武器攻撃・戦技のダメージ加算 */
  bonus: number;
  /** 武器攻撃・戦技の出血加算 */
  bleed: number;
}

export interface Buffs {
  /** この手番のあいだ有効 */
  enchant?: Enchant;
  stance?: boolean;
  broken?: boolean;
}

export interface Fighter {
  name: string;
  level: number;
  isPlayer: boolean;
  stats: Stats;
  right: Weapon;
  left: HandItem | null;
  /** 装備条件を満たしているか */
  rightOk: boolean;
  leftOk: boolean;
  armorCut: Cut;
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
  /** 溜まっている出血。上限に達すると弾けてダメージ */
  bleed: number;
  /** 溜まっている呪死。上限に達すると即死 */
  curse?: number;
  /** この探索で下げられたレベル */
  drained?: number;
  buffs: Buffs;
}

export interface Attack {
  label: string;
  dmg: number;
  type: DamageType;
  /** 武器由来（焼き油などが乗る） */
  weapon?: boolean;
  unguardable?: boolean;
  /** 当たったときに溜まる出血 */
  bleed?: number;
  /** 当たったときに溜まる呪死 */
  curse?: number;
  /** 当たると相手のレベルを1下げる */
  drain?: boolean;
  /** 反撃など、受け手がリアクションできない攻撃 */
  noReaction?: boolean;
  onHit?: (target: Fighter) => void;
}
