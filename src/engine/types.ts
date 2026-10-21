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
  /** これで呪死すると、レベルを1失う */
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
  /** 淵結晶をはめられる数（底の武器） */
  sockets?: number;
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
  /** 付帯効果 */
  effect?: { drawOnDiscard?: number };
}

/** 強敵・主の行動ひとつ */
export interface PatternMove {
  name: string;
  /** 攻撃の元（武器の攻撃か戦技）。なければ攻撃しない */
  use?: 'weapon' | 'art';
  /** 当てる回数（既定1） */
  hits?: number;
  /** ダメージの倍率（既定1） */
  mult?: number;
  unguardable?: boolean;
  /** 次の自分の手番まで、必ずガードする（ガード不可の攻撃は受ける） */
  guard?: boolean;
  /** 最大HPのこの割合だけ回復する */
  heal?: number;
  /** カードの効果を使う（魔術・祈祷など。スタミナもFPも払わない） */
  card?: string;
  /** card を使うとき、手札を何枚捨てたことにするか（捨てて使うカード用。既定0） */
  discarded?: number;
  /** 1手番かけて溜めてから放つ大技（溜めている手番は予告だけで動かない） */
  charge?: boolean;
  /** この攻撃への回避のコストを増やす */
  dodgeExtra?: number;
  /** 体幹を削る量の倍率（既定1） */
  poiseMult?: number;
  /** random のときの選ばれやすさ（既定1） */
  weight?: number;
}

/** 主の固有の仕掛け。ラウンドの初めに相手へ働く */
export interface Aura {
  name: string;
  /** 説明（敵の欄に出す） */
  text: string;
  /** 相手の手札をランダムに捨てさせる枚数（捨てられて発動するカードは発動する） */
  discard?: number;
  /** 相手に溜める呪死 */
  curse?: number;
}

/** 強敵・主の動き方。スタミナも手札もなく、決まった順番かランダムで動く */
export interface Behavior {
  /** cycle: moves を順番に繰り返す / random: 重みで選ぶ */
  mode: 'cycle' | 'random';
  moves: PatternMove[];
  /** 攻撃されたときに回避する確率・ガードする確率（その敵次第） */
  dodge: number;
  guard: number;
  /** 固有の仕掛け（ラウンドの初めに働く） */
  aura?: Aura;
  /** 第二形態。HPが at（割合）以下になると、行動表がこれに変わる（主）。aura があれば仕掛けも変わる */
  phase2?: { at: number; mode?: 'cycle' | 'random'; moves: PatternMove[]; text?: string; aura?: Aura };
}

/** 淵結晶（底の武器にはめる）で強める・弱めるもの */
export type CrystalKey = 'atk' | 'art' | 'spell' | 'bleed' | 'curse' | 'hp' | 'fp' | 'cut' | 'guard' | 'stMax';

/** 淵結晶。値の割合（atk など）は 0.1 = 10% */
export interface Crystal {
  /** 一つずつ違う（同じ効果でも別物） */
  uid: string;
  name: string;
  plus: { key: CrystalKey; value: number };
  /** 呪われた淵結晶（深海）のマイナス効果。value は弱める量（正の数） */
  minus?: { key: CrystalKey; value: number };
}

/** 装備・アクセサリ・淵結晶による戦闘中の補正 */
export interface Mods {
  guardDiscount: number;
  healPct: number;
  bleedPct: number;
  /** 武器攻撃（通常攻撃と戦技）のダメージ割合増し */
  atkPct: number;
  /** 戦技のダメージ割合増し */
  artPct: number;
  /** 魔術・祈祷の威力の割合増し */
  spellPct: number;
  /** 武器が当たったときに足す出血・呪死 */
  bleedAdd: number;
  curseAdd: number;
  /** カードの効果で手札を捨てたとき、引く枚数（邪教のフードなど） */
  drawOnDiscard?: number;
}

/** アクセサリの効果 */
export interface AccessoryEffect {
  /** 能力値の上乗せ（装備条件と補正に効く。レベルには数えない） */
  stats?: Partial<Record<StatKey, number>>;
  /** 最大HPの割合増し */
  hpPct?: number;
  /** 最大FPの加算 */
  fp?: number;
  /** 初期スタミナダイスの加算 */
  stInit?: number;
  /** カット率の加算（防具に足す） */
  cut?: Partial<Cut>;
  /** ガード消費を軽くする */
  guardDiscount?: number;
  /** 回復量の割合増し */
  healPct?: number;
  /** 与える出血の割合増し */
  bleedPct?: number;
  /** 魔術・祈祷の威力の割合増し */
  spellPct?: number;
}

/** アクセサリ（指輪・タリスマン。呼び名が違うだけ） */
export interface Accessory {
  name: string;
  kind: '指輪' | 'タリスマン';
  weight: number;
  effect: AccessoryEffect;
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
  /** 相手の手番のあいだ、リアクションで振って使わなかった出目（次のリアクションに使える。相手の手番が終わるとスタミナに戻る） */
  reactPool?: Die[];
  hand: string[];
  deck: string[];
  discard: string[];
  /** この手番で何段目まで武器攻撃したか */
  chain: number;
  /** 溜まっている出血。上限に達すると弾けてダメージ */
  bleed: number;
  /** 溜まっている呪死。上限に達すると即死 */
  curse?: number;
  /** この戦闘で呪死してレベルを失った回数（戦闘後にキャラへ反映） */
  drained?: number;
  /** アクセサリによる戦闘中の効果 */
  acc?: Mods;
  /** 強敵・主: 行動パターンと、次にする行動（予告）。あるとスタミナも手札も使わない */
  pattern?: {
    behavior: Behavior; next: number; guarding?: boolean; rank: '強敵' | '主';
    /** 溜め中（次の手番で大技を放つ） */
    charging?: boolean;
    /** 第二形態に入った */
    phased?: boolean;
  };
  /** 体幹（尽きるとよろめく） */
  poise: number;
  maxPoise: number;
  /** よろめいている（次の自分の手番は動けない。それまでリアクションもできない） */
  staggered?: boolean;
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
  /** これで呪死すると、レベルを1失う */
  drain?: boolean;
  /** 反撃など、受け手がリアクションできない攻撃 */
  noReaction?: boolean;
  onHit?: (target: Fighter) => void;
  /** 回避のコストを増やす（主の大技など） */
  dodgeExtra?: number;
  /** 体幹を削る量の倍率 */
  poiseMult?: number;
}
