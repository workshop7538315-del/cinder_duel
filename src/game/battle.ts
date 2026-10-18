import { CARDS } from '../data/cards';
import { RULES } from '../data/rules';
import { findPayment, isValidPayment, stageCost } from '../engine/cost';
import { rollDice, rollMany } from '../engine/dice';
import {
  addBleed, applyArmor, catalystFor, dodgeCost, drawCard, guardCost, guardCut, spend, weaponBleed, weaponDamage,
} from '../engine/fighter';
import { costLabel, typeName } from '../engine/format';
import type { Attack, Cost, Die, Fighter } from '../engine/types';
import { npcDraws, npcReactChoice, npcReactDice, npcTurn } from './ai';

export type Reaction = 'dodge' | 'guard' | 'take';
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
}

/** 画面側が実装する入出力。Battle は DOM を知らない。 */
export interface BattleIO {
  log(text: string, kind: LogKind): void;
  update(): void;
  flash(f: Fighter): void;
  wait(ms: number): Promise<void>;
  askDraw(): Promise<boolean>;
  /** 手番開始時に振る個数 */
  askTurnDice(max: number, suggested: number): Promise<number>;
  /** リアクションで振る個数（0 = 振らずに受ける。max が 0 なら受けるしかない） */
  askReactDice(hit: IncomingHit, max: number): Promise<number>;
  askReactChoice(hit: IncomingHit, dice: Die[], canDodge: boolean, canGuard: boolean): Promise<Reaction>;
  finished(playerWon: boolean): void;
}

/** カードが今使えない理由（使えるなら null） */
export function cardUnusable(f: Fighter, id: string): string | null {
  const c = CARDS[id];
  if (!c) return '不明なカードです。';
  if (c.fp && f.fp < c.fp) return 'FPが足りません。';
  if (c.school && !catalystFor(f, c.school)) return c.school === 'sorcery' ? '杖を持っていません。' : '聖印かタリスマンを持っていません。';
  return null;
}

export class Battle {
  round = 0;
  phase: Phase = 'wait';
  busy = false;
  turn: Fighter | null = null;
  winner: Fighter | null = null;
  private endTurnResolve: (() => void) | null = null;

  constructor(
    readonly p: Fighter,
    readonly e: Fighter,
    private io: BattleIO,
  ) {
    for (let i = 0; i < RULES.handStart; i++) {
      drawCard(p);
      drawCard(e);
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
        f.stamina = this.round === 1 ? f.stInit : Math.min(f.stMax, f.stamina + RULES.staminaRecovery);
        f.buffs.broken = false;
        f.bleed = Math.max(0, f.bleed - RULES.bleedDecay);
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
    else await npcTurn(this, f, o);
    f.action = [];
    f.chain = 0;
    f.buffs.weaponBonus = 0;
    f.buffs.weaponBleed = 0;
    this.turn = null;
    if (!this.over) {
      this.phase = 'wait';
      this.update();
    }
  }

  private async playerTurn(): Promise<void> {
    const p = this.p;
    let k = 0;
    if (p.stamina > 0) k = await this.io.askTurnDice(p.stamina, p.stamina >= 3 ? p.stamina - 1 : p.stamina);
    else this.log('スタミナダイスがない。');
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

  async weaponAttack(f: Fighter, o: Fighter): Promise<void> {
    const w = f.right;
    f.chain++;
    await this.strike(f, o, {
      label: `${w.name}・${f.chain}段目`, dmg: weaponDamage(f, w.dmg), type: w.type, weapon: true, bleed: weaponBleed(f, w.bleed),
    });
  }

  async weaponArt(f: Fighter, o: Fighter): Promise<void> {
    const a = f.right.art;
    if (!a) return;
    f.fp -= a.fp;
    f.chain = 0;
    await this.strike(f, o, {
      label: a.name, dmg: weaponDamage(f, a.dmg), type: a.type, weapon: true, unguardable: a.unguardable, bleed: weaponBleed(f, a.bleed),
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
    await c.run(this, f, o);
  }

  /* ---------------- 攻撃とリアクション ---------------- */

  async strike(att: Fighter, def: Fighter, atk: Attack): Promise<void> {
    if (this.over) return;
    const raw = applyArmor(def, atk.type, atk.dmg + (atk.weapon ? att.buffs.weaponBonus ?? 0 : 0));
    this.log(`${this.who(att)}の${atk.label}！ ${typeName(atk.type)}${raw}${atk.unguardable ? '・ガード不可' : ''}`, this.side(att));
    this.update();
    await this.wait(att.isPlayer ? 250 : 550);

    const cut = guardCut(def, atk.type);
    const hit: IncomingHit = {
      attacker: att, attack: atk, raw,
      dodgeCost: dodgeCost(def),
      guardCost: guardCost(def, raw),
      guardCut: cut,
      guardDmg: Math.round(raw * (1 - cut)),
    };
    const r = await this.react(def, hit);
    if (r === 'dodge') {
      this.log(`${this.who(def)}は回避した。`, 'dodge');
    } else {
      const dmg = r === 'guard' ? hit.guardDmg : raw;
      def.hp = Math.max(0, def.hp - dmg);
      this.log(`${r === 'guard' ? this.who(def) + 'はガードした。' : ''}${this.who(def)}に${dmg}ダメージ。`, r === 'guard' ? 'guard' : 'hit');
      this.io.flash(def);
      atk.onHit?.(def);
      this.applyBleed(att, def, atk, r === 'guard');
    }
    this.update();
    if (def.hp <= 0) this.finish(att);
  }

  /** 当たった攻撃の出血を溜め、弾けたらダメージ */
  private applyBleed(att: Fighter, def: Fighter, atk: Attack, guarded: boolean): void {
    let amount = (atk.bleed ?? 0) + (atk.weapon ? att.buffs.weaponBleed ?? 0 : 0);
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
    let r: Reaction;
    if (def.isPlayer) r = await this.io.askReactChoice(hit, def.action, canDodge, canGuard);
    else {
      await this.wait(600);
      r = npcReactChoice(canDodge, canGuard);
    }
    // 使わなかった分も含め、リアクションの行動ダイスは消える
    def.action = [];
    this.update();
    return r;
  }

  heal(f: Fighter, n: number): void {
    const before = f.hp;
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
