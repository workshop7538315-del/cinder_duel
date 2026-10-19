import { CARDS } from '../data/cards';
import { RULES } from '../data/rules';
import { findPayment, isValidPayment, stageCost } from '../engine/cost';
import { rollDice, rollMany } from '../engine/dice';
import {
  addBleed, addCurse, applyArmor, catalystFor, dodgeCost, drawCard, enchantBleed, enchantBonus, guardCost, guardCut, spend,
  weaponBleed, weaponDamage,
} from '../engine/fighter';
import { costLabel, typeName } from '../engine/format';
import type { Attack, Cost, Die, Fighter, WeaponArt } from '../engine/types';
import { npcDiscards, npcDraws, npcReactChoice, npcReactDice, npcTurn } from './ai';
import { patternReact, patternTurn } from './pattern';
import { AUTO_BEHAVIOR } from '../data/behaviors';

export type Reaction = 'dodge' | 'guard' | 'take' | 'art';
export type LogKind = 'round' | 'sys' | 'me' | 'foe' | 'hit' | 'guard' | 'dodge';
export type Phase = 'wait' | 'act' | 'over';

export interface IncomingHit {
  attacker: Fighter;
  attack: Attack;
  raw: number;
  /** null なら回避できない（過重） */
  dodgeCost: number | null;
  guardCost: number;
  guardCut: number;
  guardDmg: number;
  /** リアクション用の戦技（王朝鉈技など）。FPが足りないか持っていなければ null */
  art: WeaponArt | null;
}

/** リアクション戦技で回避したあとの反撃の構え */
export interface CounterInfo {
  owner: Fighter;
  target: Fighter;
  art: WeaponArt;
  cost: Cost;
}

/** 画面側が実装する入出力。Battle は DOM を知らない。 */
export interface BattleIO {
  log(text: string, kind: LogKind): void;
  update(): void;
  flash(f: Fighter): void;
  wait(ms: number): Promise<void>;
  askDraw(): Promise<boolean>;
  /** 手番開始時に振る個数。special を渡したときは、それを選ぶと 'special' が返る */
  askTurnDice(max: number, suggested: number, special?: SpecialAction): Promise<number | 'special'>;
  /** リアクションで振る個数（0 = 振らずに受ける。max が 0 なら受けるしかない） */
  askReactDice(hit: IncomingHit, max: number): Promise<number>;
  askReactChoice(hit: IncomingHit, dice: Die[], canDodge: boolean, canGuard: boolean, canArt: boolean): Promise<Reaction>;
  /** 手札から捨てるカードを選ぶ（hand の添字を返す） */
  askDiscard(hand: string[], min: number, max: number, cardName: string): Promise<number[]>;
  /** 反撃の好機に振る個数（0 = 見送る） */
  askCounter(info: CounterInfo, max: number): Promise<number>;
  finished(playerWon: boolean): void;
}

/** 手番を丸ごと使って行う特別な行動（地下墓で落としたソウルの回収など） */
export interface SpecialAction {
  label: string;
  note: string;
  /** 行ったときのログ */
  use: () => string;
}

/** カードが今使えない理由（使えるなら null） */
export function cardUnusable(f: Fighter, id: string): string | null {
  const c = CARDS[id];
  if (!c) return '不明なカードです。';
  if (c.unplayable) return '捨てられたときにだけ発動するカードです。';
  if (c.fp && f.fp < c.fp) return 'FPが足りません。';
  if (c.discard && f.hand.length - 1 < c.discard.min) return `ほかに捨てる手札が${c.discard.min}枚必要です。`;
  if (c.enchant && f.right.noEnchant) return `${f.right.name}にはエンチャントできません。`;
  if (c.school && !catalystFor(f, c.school)) return c.school === 'sorcery' ? '杖を持っていません。' : '聖印かタリスマンを持っていません。';
  return null;
}

/** 割合で強める（淵結晶など。0以上に収める） */
const boosted = (dmg: number, pct = 0): number => Math.max(0, Math.round(dmg * (1 + pct)));
/** 足す（どちらもなければ undefined のまま） */
const addOn = (v: number | undefined, add = 0): number | undefined => (v || add ? (v ?? 0) + add : v);

export class Battle {
  round = 0;
  phase: Phase = 'wait';
  busy = false;
  turn: Fighter | null = null;
  winner: Fighter | null = null;
  private endTurnResolve: (() => void) | null = null;
  /** 反撃の構え（相手が次に攻撃以外をしたら反撃できる） */
  counter: CounterInfo | null = null;
  /** プレイヤーが手番の代わりに1回だけ行える特別な行動 */
  special: SpecialAction | null = null;

  constructor(
    readonly p: Fighter,
    readonly e: Fighter,
    private io: BattleIO,
  ) {
    // 強敵・主（パターンで動く）は手札を持たない
    for (let i = 0; i < RULES.handStart; i++) {
      if (!p.pattern) drawCard(p);
      if (!e.pattern) drawCard(e);
    }
  }

  get over(): boolean {
    return this.phase === 'over';
  }
  who(f: Fighter): string {
    return f.isPlayer ? 'あなた' : f.name;
  }
  side(f: Fighter): LogKind {
    return f.isPlayer ? 'me' : 'foe';
  }
  log(text: string, kind: LogKind = 'sys'): void {
    this.io.log(text, kind);
  }
  wait(ms: number): Promise<void> {
    return this.io.wait(ms);
  }
  update(): void {
    this.io.update();
  }
  draw(f: Fighter): string | null {
    return drawCard(f);
  }

  /* ---------------- 進行 ---------------- */

  async run(): Promise<void> {
    this.log(`${this.e.name}（Lv${this.e.level}）が立ちはだかる。`);
    while (!this.over) {
      this.round++;
      for (const f of [this.p, this.e]) {
        // 強敵・主はスタミナを使わない
        f.stamina = f.pattern ? 0 : this.round === 1 ? f.stInit : Math.min(f.stMax, f.stamina + RULES.staminaRecovery);
        f.buffs.broken = false;
        f.bleed = Math.max(0, f.bleed - RULES.bleedDecay);
        f.curse = Math.max(0, (f.curse ?? 0) - RULES.curseDecay);
      }
      this.log(`ラウンド ${this.round}`, 'round');
      this.update();
      await this.drawPhase();

      for (const f of [this.p, this.e]) {
        f.speedRoll = rollMany(f.weight.speedDice);
        f.speed = f.speedRoll.reduce((a, b) => a + b, 0);
      }
      const { p, e } = this;
      const order = p.speed >= e.speed ? [p, e] : [e, p];
      this.log(
        `速度：あなた ${p.speed}（${p.speedRoll.join('+')}）／${e.name} ${e.speed}（${e.speedRoll.join('+')}）。${this.who(order[0])}が先手。`,
      );
      this.update();
      await this.wait(500);
      for (const f of order) {
        if (this.over) break;
        await this.takeTurn(f, f === p ? e : p);
      }
    }
  }

  private canDraw(f: Fighter): boolean {
    return f.stamina >= RULES.drawCost && f.deck.length + f.discard.length > 0;
  }

  private async drawPhase(): Promise<void> {
    const { p, e } = this;
    if (this.canDraw(p) && (await this.io.askDraw())) {
      p.stamina -= RULES.drawCost;
      const c = drawCard(p);
      if (c) this.log(`スタミナダイスを${RULES.drawCost}個払い「${CARDS[c].name}」を引いた。`, 'me');
    }
    if (this.canDraw(e) && npcDraws(e)) {
      e.stamina -= RULES.drawCost;
      if (drawCard(e)) this.log(`${e.name}はスタミナダイスを${RULES.drawCost}個払い、カードを引いた。`, 'foe');
    }
    this.update();
  }

  private async takeTurn(f: Fighter, o: Fighter): Promise<void> {
    f.buffs.stance = false;
    f.chain = 0;
    this.turn = f;
    this.update();
    if (f.isPlayer) await this.playerTurn();
    else if (f.pattern) await patternTurn(this, f, o);
    else await npcTurn(this, f, o);
    // 手番を終えるのも「攻撃以外」なので、反撃の構えがあれば反撃される
    await this.afterAction(f, false);
    this.counter = null;
    f.action = [];
    f.chain = 0;
    f.buffs.enchant = undefined;
    this.turn = null;
    if (!this.over) {
      this.phase = 'wait';
      this.update();
    }
  }

  private async playerTurn(): Promise<void> {
    const p = this.p;
    let k = 0;
    if (p.stamina > 0 || this.special) {
      const r = await this.io.askTurnDice(p.stamina, p.stamina >= 3 ? p.stamina - 1 : p.stamina, this.special ?? undefined);
      if (r === 'special' && this.special) {
        // 手番を丸ごと使う。ダイスは振らず、そのまま手番を終える
        const sp = this.special;
        this.special = null;
        this.log(sp.use(), 'me');
        this.update();
        return;
      }
      k = r === 'special' ? 0 : r;
    } else this.log('スタミナダイスがない。');
    this.rollAction(p, Math.max(0, k));
    this.phase = 'act';
    this.update();
    await new Promise<void>((r) => (this.endTurnResolve = r));
    this.endTurnResolve = null;
  }

  /** スタミナダイスをまとめて振って行動ダイスにする */
  rollAction(f: Fighter, k: number): void {
    k = Math.max(0, Math.min(k, f.stamina));
    f.stamina -= k;
    f.action = rollDice(k);
    if (k) this.log(`${this.who(f)}はスタミナダイスを${k}個振った：${f.action.map((d) => d.v).join('・')}`, this.side(f));
  }

  /* ---------------- 行動（プレイヤーとNPCで共通） ---------------- */

  /** 行動のあと。反撃の構えを取られていて、攻撃以外をしたなら反撃が来る */
  private async afterAction(f: Fighter, isAttack: boolean): Promise<void> {
    const c = this.counter;
    if (!c || c.target !== f || this.over) return;
    this.counter = null;
    if (!isAttack) await this.resolveCounter(c);
  }

  private async resolveCounter(c: CounterInfo): Promise<void> {
    const { owner, target, art } = c;
    this.log(`${this.who(target)}の隙に、${this.who(owner)}は反撃を狙う。`, this.side(owner));
    if (owner.stamina === 0) {
      this.log(`スタミナダイスがなく、反撃できなかった。`);
      return;
    }
    const k = owner.isPlayer ? await this.io.askCounter(c, owner.stamina) : Math.min(owner.stamina, 3);
    if (k <= 0) {
      this.log(`${this.who(owner)}は反撃を見送った。`);
      return;
    }
    this.rollAction(owner, k);
    this.update();
    const pay = findPayment(owner.action, c.cost);
    owner.action = [];
    if (!pay) {
      this.log(`出目が足りず、反撃できなかった。`);
      this.update();
      return;
    }
    await this.strike(owner, target, {
      label: `${art.name}・反撃`, dmg: weaponDamage(owner, art.dmg), type: art.type, weapon: true, noReaction: true,
      bleed: weaponBleed(owner, art.bleed),
    });
  }

  /** 王朝鉈技などのリアクション戦技を使える状態か（FPと戦技の有無） */
  reactionArt(f: Fighter): WeaponArt | null {
    const a = f.right.art;
    return a?.reaction && f.fp >= a.fp ? a : null;
  }

  /** エンチャントを掛ける（重ね掛けはできず、前のものは消える） */
  enchant(f: Fighter, name: string, e: { bonus?: number; bleed?: number }): void {
    const prev = f.buffs.enchant;
    f.buffs.enchant = { name, bonus: e.bonus ?? 0, bleed: e.bleed ?? 0 };
    this.log(`${prev ? `「${prev.name}」が消え、` : ''}武器に「${name}」を掛けた。`, this.side(f));
  }

  async weaponAttack(f: Fighter, o: Fighter): Promise<void> {
    await this.afterAction(f, true);
    const w = f.right;
    f.chain++;
    await this.strike(f, o, {
      label: `${w.name}・${f.chain}段目`, dmg: boosted(weaponDamage(f, w.dmg), f.acc?.atkPct), type: w.type, weapon: true,
      bleed: addOn(weaponBleed(f, w.bleed), f.acc?.bleedAdd), curse: addOn(w.curse, f.acc?.curseAdd),
    });
  }

  async weaponArt(f: Fighter, o: Fighter): Promise<void> {
    const a = f.right.art;
    if (!a || a.reaction) return;
    await this.afterAction(f, true);
    f.fp -= a.fp;
    f.chain = 0;
    await this.strike(f, o, {
      label: a.name, dmg: boosted(weaponDamage(f, a.dmg), (f.acc?.atkPct ?? 0) + (f.acc?.artPct ?? 0)), type: a.type, weapon: true,
      unguardable: a.unguardable, bleed: addOn(weaponBleed(f, a.bleed), f.acc?.bleedAdd), curse: addOn(a.curse, f.acc?.curseAdd), drain: a.drain,
    });
  }

  async playCard(f: Fighter, o: Fighter, index: number, pay: Die[]): Promise<void> {
    const id = f.hand[index];
    const c = CARDS[id];
    if (c.fp) f.fp -= c.fp;
    f.hand.splice(index, 1);
    f.discard.push(id);
    f.chain = 0;
    this.log(`${f.isPlayer ? '' : f.name + 'は'}「${c.name}」を使った（${pay.map((d) => d.v).join('・')}）。`, this.side(f));
    this.update();
    const isAttack = c.role === 'attack';
    if (isAttack) await this.afterAction(f, true);
    const discarded = c.discard ? await this.discardFor(f, o, c.discard.min, c.discard.max, c.name) : 0;
    if (!this.over) await c.run(this, f, o, { discarded });
    if (!isAttack) await this.afterAction(f, false);
  }

  /** 手札から選んで捨てる。捨てられて発動するカードはここで発動する。捨てた枚数を返す */
  private async discardFor(f: Fighter, o: Fighter, min: number, max: number, name: string): Promise<number> {
    const n = Math.min(max, f.hand.length);
    if (n < min) return 0;
    const picks = f.isPlayer ? await this.io.askDiscard([...f.hand], min, n, name) : npcDiscards(f.hand, min, n);
    const ids = [...new Set(picks)].filter((i) => i >= 0 && i < f.hand.length).slice(0, n).map((i) => f.hand[i]);
    for (const id of ids) {
      f.hand.splice(f.hand.indexOf(id), 1);
      f.discard.push(id);
    }
    this.log(`${this.who(f)}は${ids.map((id) => `「${CARDS[id].name}」`).join('')}を捨てた。`, this.side(f));
    this.update();
    for (const id of ids) {
      const tr = CARDS[id].onDiscard;
      if (tr && !this.over) {
        this.log(`「${CARDS[id].name}」が発動した。`, this.side(f));
        await tr.run(this, f, o);
      }
    }
    return ids.length;
  }

  /* ---------------- 攻撃とリアクション ---------------- */

  async strike(att: Fighter, def: Fighter, atk: Attack): Promise<void> {
    if (this.over) return;
    const raw = applyArmor(def, atk.type, atk.dmg + (atk.weapon ? enchantBonus(att) : 0));
    this.log(`${this.who(att)}の${atk.label}！ ${typeName(atk.type)}${raw}${atk.unguardable ? '・ガード不可' : ''}`, this.side(att));
    this.update();
    await this.wait(att.isPlayer ? 250 : 550);

    // 強敵・主のガードは、盾でも受けきれない（上限あり）
    const cut = def.pattern ? Math.min(guardCut(def, atk.type), AUTO_BEHAVIOR.guardCutCap) : guardCut(def, atk.type);
    const hit: IncomingHit = {
      attacker: att, attack: atk, raw,
      dodgeCost: dodgeCost(def, raw),
      guardCost: guardCost(def, raw),
      guardCut: cut,
      guardDmg: Math.round(raw * (1 - cut)),
      art: this.reactionArt(def),
    };
    const r = atk.noReaction ? 'take' : await this.react(def, hit);
    if (r === 'art' && hit.art) {
      def.fp -= hit.art.fp;
      this.counter = { owner: def, target: att, art: hit.art, cost: hit.art.reaction!.counterCost };
      this.log(`${this.who(def)}は「${hit.art.name}」でかわし、反撃の構えを取った。`, 'dodge');
    } else if (r === 'dodge') {
      this.log(`${this.who(def)}は回避した。`, 'dodge');
    } else {
      const dmg = r === 'guard' ? hit.guardDmg : raw;
      def.hp = Math.max(0, def.hp - dmg);
      this.log(`${r === 'guard' ? this.who(def) + 'はガードした。' : ''}${this.who(def)}に${dmg}ダメージ。`, r === 'guard' ? 'guard' : 'hit');
      this.io.flash(def);
      atk.onHit?.(def);
      this.applyBleed(att, def, atk, r === 'guard');
      this.applyCurse(def, atk, r === 'guard');
    }
    this.update();
    if (def.hp <= 0) this.finish(att);
  }

  /** 呪死を溜め、溜まりきったら即死。レベルを奪う攻撃で呪死したら、レベルを1失う（戦闘後にキャラへ反映） */
  private applyCurse(def: Fighter, atk: Attack, guarded: boolean): void {
    if (def.hp <= 0) return;
    let amount = atk.curse ?? 0;
    if (guarded) amount = Math.floor(amount * RULES.curseGuardRatio);
    if (amount <= 0) return;
    if (addCurse(def, amount)) {
      def.hp = 0;
      this.log(`${this.who(def)}は呪死した。`, 'hit');
      if (atk.drain) {
        def.drained = (def.drained ?? 0) + 1;
        this.log(`${this.who(def)}はレベルを1失った。`, 'hit');
      }
      this.io.flash(def);
    } else {
      this.log(`${this.who(def)}に呪死が溜まった（${def.curse}/${RULES.curseThreshold}）。`);
    }
  }

  /** 当たった攻撃の出血を溜め、弾けたらダメージ */
  private applyBleed(att: Fighter, def: Fighter, atk: Attack, guarded: boolean): void {
    let amount = (atk.bleed ?? 0) + (atk.weapon ? enchantBleed(att) : 0);
    amount = Math.floor(amount * (1 + (att.acc?.bleedPct ?? 0)));
    if (guarded) amount = Math.floor(amount * RULES.bleedGuardRatio);
    if (amount <= 0 || def.hp <= 0) return;
    const burst = addBleed(def, amount);
    if (burst) {
      def.hp = Math.max(0, def.hp - burst);
      this.log(`${this.who(def)}は出血した！ ${burst}ダメージ。`, 'hit');
      this.io.flash(def);
    } else {
      this.log(`${this.who(def)}に出血が溜まった（${def.bleed}/${RULES.bleedThreshold}）。`);
    }
  }

  private async react(def: Fighter, hit: IncomingHit): Promise<Reaction> {
    if (def.pattern) {
      await this.wait(400);
      return patternReact(def, hit);
    }
    if (def.stamina === 0) {
      if (def.isPlayer) await this.io.askReactDice(hit, 0);
      return 'take';
    }
    const k = def.isPlayer ? await this.io.askReactDice(hit, def.stamina) : npcReactDice(def, hit);
    if (k <= 0) return 'take';
    this.rollAction(def, k);
    this.update();
    const canDodge = hit.dodgeCost !== null && !!findPayment(def.action, { t: 'sum', n: hit.dodgeCost });
    const canGuard = !hit.attack.unguardable && !!findPayment(def.action, { t: 'sum', n: hit.guardCost });
    const canArt = !!hit.art && !!findPayment(def.action, hit.art.cost);
    let r: Reaction;
    if (def.isPlayer) r = await this.io.askReactChoice(hit, def.action, canDodge, canGuard, canArt);
    else {
      await this.wait(600);
      r = npcReactChoice(canDodge, canGuard, canArt);
    }
    // 使わなかった分も含め、リアクションの行動ダイスは消える
    def.action = [];
    this.update();
    return r;
  }

  heal(f: Fighter, n: number): void {
    const before = f.hp;
    n = Math.floor(n * (1 + (f.acc?.healPct ?? 0)));
    f.hp = Math.min(f.maxHp, f.hp + n);
    this.log(`${this.who(f)}はHPを${f.hp - before}回復した。`, this.side(f));
  }

  private finish(winner: Fighter): void {
    if (this.over) return;
    this.phase = 'over';
    this.winner = winner;
    this.log(winner.isPlayer ? `${this.e.name}は灰に還った。` : 'あなたは倒れた。', 'round');
    this.update();
    this.endTurnResolve?.();
    this.io.finished(winner.isPlayer);
  }

  /* ---------------- プレイヤーの操作 ---------------- */

  canAct(): boolean {
    return this.phase === 'act' && !this.busy && !this.over;
  }
  canPay(cost: Cost, fp = 0): boolean {
    return this.canAct() && this.p.fp >= fp && !!findPayment(this.p.action, cost);
  }
  /** 次の段の武器攻撃コスト（連撃上限なら null） */
  weaponCost(f: Fighter = this.p): Cost | null {
    const w = f.right;
    return f.chain >= w.maxChain ? null : stageCost(w, f.chain);
  }

  /** 選んだダイス（未選択なら自動）で払う。失敗時はメッセージを返す。 */
  private pay(cost: Cost, selected: number[]): Die[] | string {
    const p = this.p;
    const sel = p.action.filter((d) => selected.includes(d.id));
    let pay: Die[] | null;
    if (sel.length) {
      if (!isValidPayment(sel, cost)) return `選んだダイスでは ${costLabel(cost)} を払えません。`;
      pay = sel;
    } else {
      pay = findPayment(p.action, cost);
      if (!pay) return '払えるダイスがありません。';
    }
    spend(p, pay);
    return pay;
  }

  private async command(fn: () => Promise<string | null>): Promise<string | null> {
    if (!this.canAct()) return null;
    this.busy = true;
    this.update();
    try {
      return await fn();
    } finally {
      this.busy = false;
      if (!this.over) this.update();
    }
  }

  useWeapon(selected: number[]): Promise<string | null> {
    return this.command(async () => {
      const c = this.weaponCost();
      if (!c) return '連撃はここまでです。';
      const pay = this.pay(c, selected);
      if (typeof pay === 'string') return pay;
      await this.weaponAttack(this.p, this.e);
      return null;
    });
  }

  useArt(selected: number[]): Promise<string | null> {
    return this.command(async () => {
      const a = this.p.right.art;
      if (!a) return 'この武器には戦技がありません。';
      if (a.reaction) return `「${a.name}」は攻撃されたときに使う戦技です。`;
      if (this.p.fp < a.fp) return 'FPが足りません。';
      const pay = this.pay(a.cost, selected);
      if (typeof pay === 'string') return pay;
      await this.weaponArt(this.p, this.e);
      return null;
    });
  }

  useCard(index: number, selected: number[]): Promise<string | null> {
    return this.command(async () => {
      const id = this.p.hand[index];
      const why = cardUnusable(this.p, id);
      if (why) return why;
      const pay = this.pay(CARDS[id].cost, selected);
      if (typeof pay === 'string') return pay;
      await this.playCard(this.p, this.e, index, pay);
      return null;
    });
  }

  /** 自分の手番中だけ降参できる。成功したら true */
  surrender(): boolean {
    if (!this.canAct()) return false;
    this.phase = 'over';
    this.winner = this.e;
    this.log('あなたは降参した。', 'round');
    this.endTurnResolve?.();
    return true;
  }

  endTurn(): void {
    if (this.phase !== 'act' || this.busy || !this.endTurnResolve) return;
    this.log('手番を終えた。', 'me');
    this.endTurnResolve();
  }
}
