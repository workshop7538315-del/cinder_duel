import { CARDS } from '../data/cards';
import { RULES } from '../data/rules';
import { findPayment, isValidPayment, stageCost } from '../engine/cost';
import { rollDice, rollMany } from '../engine/dice';
import { applyArmor, dodgeCost, drawCard, guardCost, guardCut, spend } from '../engine/fighter';
import { costLabel, typeName } from '../engine/format';
import { scaled } from '../engine/scaling';
import type { Attack, Cost, Die, Fighter } from '../engine/types';
import { npcReactChoice, npcReactDice, npcTurn } from './ai';

export type Reaction = 'dodge' | 'guard' | 'take';
export type LogKind = 'round' | 'sys' | 'me' | 'foe' | 'hit' | 'guard' | 'dodge';
export type Phase = 'wait' | 'act' | 'over';

export interface IncomingHit {
  attacker: Fighter;
  attack: Attack;
  raw: number;
  dodgeCost: number;
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
    for (let i = 0; i < RULES.handStart; i++) drawCard(p);
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
    this.log(`${this.e.name}が立ちはだかる。`);
    while (!this.over) {
      this.round++;
      for (const f of [this.p, this.e]) {
        f.stamina = this.round === 1 ? f.stInit : Math.min(f.stMax, f.stamina + RULES.staminaRecovery);
        f.buffs.broken = false;
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

  private async drawPhase(): Promise<void> {
    const p = this.p;
    if (p.stamina < RULES.drawCost || !(p.deck.length + p.discard.length)) return;
    if (!(await this.io.askDraw())) return;
    p.stamina -= RULES.drawCost;
    const c = drawCard(p);
    if (c) this.log(`スタミナダイスを${RULES.drawCost}個払い「${CARDS[c].name}」を引いた。`, 'me');
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
    f.buffs.oil = false;
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

  /* ---------------- 攻撃とリアクション ---------------- */

  async strike(att: Fighter, def: Fighter, atk: Attack): Promise<void> {
    if (this.over) return;
    let raw = atk.dmg + (atk.weapon && att.buffs.oil ? RULES.oilBonus : 0);
    raw = applyArmor(def, atk.type, raw);
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
    }
    this.update();
    if (def.hp <= 0) this.finish(att);
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
    const canDodge = !!findPayment(def.action, { t: 'sum', n: hit.dodgeCost });
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
  weaponCost(): Cost | null {
    const w = this.p.weapon;
    return this.p.chain >= w.maxChain ? null : stageCost(w, this.p.chain);
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
      const p = this.p;
      const w = p.weapon;
      const c = this.weaponCost();
      if (!c) return '連撃はここまでです。';
      const pay = this.pay(c, selected);
      if (typeof pay === 'string') return pay;
      p.chain++;
      await this.strike(p, this.e, { label: `${w.name}・${p.chain}段目`, dmg: scaled(w.dmg, p.stats), type: w.type, weapon: true });
      return null;
    });
  }

  useArt(selected: number[]): Promise<string | null> {
    return this.command(async () => {
      const p = this.p;
      const a = p.weapon.art;
      if (p.fp < a.fp) return 'FPが足りません。';
      const pay = this.pay(a.cost, selected);
      if (typeof pay === 'string') return pay;
      p.fp -= a.fp;
      p.chain = 0;
      await this.strike(p, this.e, {
        label: a.name, dmg: scaled(a.dmg, p.stats), type: a.type, weapon: true, unguardable: a.unguardable,
      });
      return null;
    });
  }

  useCard(index: number, selected: number[]): Promise<string | null> {
    return this.command(async () => {
      const p = this.p;
      const id = p.hand[index];
      const c = CARDS[id];
      if (!c) return null;
      if (c.fp && p.fp < c.fp) return 'FPが足りません。';
      const pay = this.pay(c.cost, selected);
      if (typeof pay === 'string') return pay;
      if (c.fp) p.fp -= c.fp;
      p.hand.splice(index, 1);
      p.discard.push(id);
      p.chain = 0;
      this.log(`「${c.name}」を使った（${pay.map((d) => d.v).join('・')}）。`, 'me');
      this.update();
      await c.run(this, p, this.e);
      return null;
    });
  }

  endTurn(): void {
    if (this.phase !== 'act' || this.busy || !this.endTurnResolve) return;
    this.log('手番を終えた。', 'me');
    this.endTurnResolve();
  }
}
