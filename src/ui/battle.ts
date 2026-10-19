import type { Character } from '../character/model';
import { CARDS, weaponHit } from '../data/cards';
import { weaponBleed } from '../engine/fighter';
import { costLabel, typeName } from '../engine/format';
import { RULES } from '../data/rules';
import { scaleLabel } from '../engine/scaling';
import type { Die, Fighter } from '../engine/types';
import {
  Battle, cardUnusable, type BattleIO, type IncomingHit, type LogKind, type Reaction, type SpecialAction,
} from '../game/battle';
import { makeFighter, scaleHp } from '../game/setup';
import { $, dieHTML, esc, show } from './dom';
import { askCount, modal, pickCards } from './modal';

let B: Battle | null = null;
let sel = new Set<number>();
/** 戦闘が終わったとき（勝敗と、終わったときの自分の状態） */
export type BattleEnd = (won: boolean, me: Fighter) => void;
let onExit: BattleEnd = () => {};

/* ---------------- 表示 ---------------- */

function log(text: string, kind: LogKind = 'sys'): void {
  const el = $('#log');
  const p = document.createElement('p');
  p.className = kind;
  p.textContent = text;
  el.appendChild(p);
  while (el.children.length > 120) el.firstChild?.remove();
  el.scrollTop = el.scrollHeight;
}
const hint = (t: string) => ($('#hint').textContent = t);
function flash(f: Fighter): void {
  const el = f.isPlayer ? $('#mePanel') : $('#foePanel');
  el.classList.remove('hit');
  void el.offsetWidth;
  el.classList.add('hit');
}

function panelHTML(b: Battle, f: Fighter): string {
  const bar = (c: string, v: number, m: number) =>
    `<div class="bar ${c}"><i style="width:${m ? Math.max(0, (v / m) * 100) : 0}%"></i></div>`;
  const sq = Array.from({ length: f.stMax }, (_, i) => `<span class="sq ${i < f.stamina ? 'on' : ''}"></span>`).join('');
  const chips: string[] = [];
  if (f.speed) chips.push(`<span class="chip">速度 ${f.speed}</span>`);
  if (b.turn === f) chips.push(`<span class="chip turn">手番</span>`);
  if (!f.isPlayer) chips.push(`<span class="chip">手札 ${f.hand.length}</span>`);
  if (f.buffs.stance) chips.push(`<span class="chip buff">構え</span>`);
  const en = f.buffs.enchant;
  if (en) chips.push(`<span class="chip buff">${en.name}${en.bonus ? ` +${en.bonus}` : ''}${en.bleed ? ` 出血+${en.bleed}` : ''}</span>`);
  if (b.counter?.owner === f) chips.push(`<span class="chip turn">反撃の構え</span>`);
  if (f.buffs.broken) chips.push(`<span class="chip debuff">体勢崩し</span>`);
  if (f.bleed) chips.push(`<span class="chip debuff">出血 ${f.bleed}/${RULES.bleedThreshold}</span>`);
  if (f.curse) chips.push(`<span class="chip debuff">呪死 ${f.curse}/${RULES.curseThreshold}</span>`);
  const md = !f.isPlayer && f.action.length
    ? `<span class="minidice">${f.action.map((d) => dieHTML(d.v)).join('')}</span>` : '';
  const gear = [f.right.name, f.left?.name].filter(Boolean).join('＋');
  return `<div class="ph"><span class="nm">${f.isPlayer ? 'あなた・' : ''}${esc(f.name)} <small>Lv${f.level}</small></span>
      <span class="wt">${f.weight.name}・${gear}</span></div>
    <div class="row"><span class="lbl">HP</span>${bar('hp', f.hp, f.maxHp)}<span class="num">${f.hp}/${f.maxHp}</span></div>
    <div class="row"><span class="lbl">FP</span>${bar('fp', f.fp, f.maxFp)}<span class="num">${f.fp}/${f.maxFp}</span></div>
    <div class="row"><span class="lbl">ST</span><span class="sd">${sq}</span><span class="num">${f.stamina}/${f.stMax}</span></div>
    <div class="chips">${chips.join('')}${md}</div>`;
}

function render(): void {
  const b = B;
  if (!b) return;
  const { p, e } = b;
  const foe = $('#foePanel');
  const me = $('#mePanel');
  foe.innerHTML = panelHTML(b, e);
  me.innerHTML = panelHTML(b, p);
  foe.classList.toggle('turn', b.turn === e);
  me.classList.toggle('turn', b.turn === p);

  const myAct = b.canAct();

  // 行動ダイス
  const dice = $('#dice');
  const note = $('#trayNote');
  if (b.phase === 'act' && p.action.length) {
    dice.innerHTML = p.action
      .map((d) => dieHTML(d.v, (sel.has(d.id) ? 'sel ' : '') + (d.fresh ? 'new' : ''), 'button',
        `type="button" data-die="${d.id}" ${myAct ? '' : 'disabled'}`))
      .join('');
    p.action.forEach((d) => (d.fresh = false));
    const picked = p.action.filter((d) => sel.has(d.id));
    note.textContent = picked.length ? `選択中 合計${picked.reduce((a, d) => a + d.v, 0)}` : 'タップで選択／未選択なら自動';
  } else {
    const msg = b.phase === 'act' ? '行動ダイスは残っていない。' : b.over ? '決着' : '自分の手番に振ったダイスがここに並ぶ。';
    dice.innerHTML = `<span class="empty">${msg}</span>`;
    note.textContent = '';
  }

  // 武器攻撃・戦技
  const w = p.right;
  const a = w.art;
  const wCost = b.weaponCost();
  const weak = p.rightOk ? '' : '・能力不足';
  const bleedText = (s: Parameters<typeof weaponBleed>[1]) => {
    const n = weaponBleed(p, s) + (p.buffs.enchant?.bleed ?? 0);
    return n ? `・出血${n}` : '';
  };
  $('#actions').innerHTML = `
    <button type="button" class="act" data-act="weapon" ${wCost && b.canPay(wCost) ? '' : 'disabled'}>
      <span class="an">${wCost ? `${esc(w.name)}・${p.chain + 1}段目` : '連撃はここまで'}</span>
      <span class="ac">${wCost ? costLabel(wCost) : '—'}</span>
      <span class="ad">${typeName(w.type)}${weaponHit(p, w.dmg)}${bleedText(w.bleed)}・最大${w.maxChain}段（+${w.inc}ずつ重く）・${scaleLabel(w.dmg)}${weak}</span></button>
    ${a && a.reaction
      ? `<button type="button" class="act" disabled>
      <span class="an">戦技「${a.name}」</span>
      <span class="ac">${costLabel(a.cost, a.fp)}</span>
      <span class="ad">攻撃されたときに回避として使う。相手が攻撃以外をしたら${costLabel(a.reaction.counterCost)}で反撃（${typeName(a.type)}${weaponHit(p, a.dmg)}${bleedText(a.bleed)}）</span></button>`
      : a
      ? `<button type="button" class="act" data-act="art" ${b.canPay(a.cost, a.fp) ? '' : 'disabled'}>
      <span class="an">戦技「${a.name}」</span>
      <span class="ac">${costLabel(a.cost, a.fp)}</span>
      <span class="ad">${typeName(a.type)}${weaponHit(p, a.dmg)}${bleedText(a.bleed)}${a.unguardable ? '・ガード不可' : ''}・${scaleLabel(a.dmg)}${weak}</span></button>`
      : `<button type="button" class="act" disabled><span class="an">戦技なし</span><span class="ac">—</span><span class="ad">${esc(w.name)}には戦技がない</span></button>`}
    <button type="button" class="act end" data-act="end" ${myAct ? '' : 'disabled'}>手番を終える</button>`;

  // 手札
  $('#hand').innerHTML = p.hand.length
    ? p.hand.map((id, i) => {
        const c = CARDS[id];
        const ok = !cardUnusable(p, id) && b.canPay(c.cost, c.fp ?? 0);
        return `<button type="button" class="card" data-card="${i}" ${ok ? '' : 'disabled'}>
          <span class="k">${c.kind}</span><span class="n">${c.name}</span>
          <span class="c">${c.unplayable ? '捨てると発動' : costLabel(c.cost, c.fp)}</span><span class="t">${c.text(p)}</span></button>`;
      }).join('')
    : '<span class="empty">手札なし</span>';
  $('#deckNote').textContent = `山札 ${p.deck.length}・捨て札 ${p.discard.length}`;
  $<HTMLButtonElement>('#surrender').disabled = !myAct;
}

async function command(fn: (ids: number[]) => Promise<string | null>): Promise<void> {
  const ids = [...sel];
  sel.clear();
  hint('');
  const err = await fn(ids);
  if (err) {
    sel = new Set(ids);
    hint(err);
    render();
  }
}

/* ---------------- 入出力（Battle → 画面） ---------------- */

function reactHead(hit: IncomingHit): string {
  const o = hit.attack;
  return `<p class="eyebrow">リアクション</p><h3>${esc(hit.attacker.name)}の${o.label}</h3>
    <p class="incoming">${typeName(o.type)} <b>${hit.raw}</b>${o.unguardable ? '　ガード不可' : ''}</p>
    ${o.curse || o.drain ? `<p class="stain-note">${o.curse ? `当たると呪死が${o.curse}溜まる（${RULES.curseThreshold}で即死。今 ${hit.attacker === B?.e ? B.p.curse ?? 0 : 0}）。` : ''}${o.drain ? '呪死するとレベルを1失う。' : ''}回避すれば防げる。</p>` : ''}
    <ul class="opts"><li>${hit.dodgeCost === null ? '過重のため回避できない' : `回避 [${hit.dodgeCost}] → 0ダメージ`}</li>
    <li>${o.unguardable ? 'ガードはできない' : `ガード [${hit.guardCost}] → ${hit.guardDmg}ダメージ（カット${Math.round(hit.guardCut * 100)}%）`}</li>
    ${hit.art ? `<li>戦技「${hit.art.name}」${costLabel(hit.art.cost, hit.art.fp)} → 回避して反撃の構え</li>` : ''}</ul>`;
}

const io: BattleIO = {
  log,
  update: render,
  flash,
  wait: (ms) => new Promise((r) => setTimeout(r, ms)),

  async askDraw() {
    const b = B!;
    const p = b.p;
    const v = await modal(`<p class="eyebrow">ラウンド ${b.round}</p><h3>カードを引く？</h3>
      <p class="note">スタミナダイス ${p.stamina}／${p.stMax}・手札 ${p.hand.length}枚。払ったダイスはこのラウンドの攻防に使えません。</p>
      <div class="btns"><button type="button" class="primary" data-v="y">1個払って1枚引く</button><button type="button" data-v="n">引かない</button></div>`);
    return v === 'y';
  },

  async askTurnDice(max, suggested, special) {
    const k = await askCount({
      title: 'あなたの手番',
      text: max
        ? '振ったダイスは手番終了時に消えます。振らなかった分は相手の攻撃へのリアクション用に残ります。'
        : 'スタミナダイスがありません。',
      max, def: suggested, btn: 'まとめて振る',
      alt: max ? undefined : '何もせず手番を終える',
      extra: special ? { label: special.label, note: special.note } : undefined,
    });
    return k === -2 ? 'special' : Math.max(0, k);
  },

  async askReactDice(hit, max) {
    if (max === 0) {
      await modal(reactHead(hit) + `<p class="note">スタミナダイスが残っていない。</p>
        <div class="btns"><button type="button" class="primary" data-v="t">受ける</button></div>`);
      return 0;
    }
    const k = await askCount({ head: reactHead(hit), max, def: Math.min(max, 2), btn: 'まとめて振る', alt: '振らずに受ける' });
    return Math.max(0, k);
  },

  async askReactChoice(hit, dice: Die[], canDodge, canGuard, canArt) {
    const ung = hit.attack.unguardable;
    const dodgeLabel = hit.dodgeCost === null ? '回避できない' : `回避 [${hit.dodgeCost}]`;
    const v = await modal(`<p class="eyebrow">リアクション</p><h3>出目：${dice.map((d) => d.v).join('・')}</h3>
      <div class="dice">${dice.map((d) => dieHTML(d.v, 'new')).join('')}</div>
      <p class="note">使わなかったダイスは消えます。</p>
      <div class="btns">
        <button type="button" data-v="dodge" class="${canDodge ? 'primary' : ''}" ${canDodge ? '' : 'disabled'}>${dodgeLabel}<small>0ダメージ</small></button>
        <button type="button" data-v="guard" ${canGuard ? '' : 'disabled'}>${ung ? 'ガード不可' : `ガード [${hit.guardCost}]`}<small>${ung ? '' : hit.guardDmg + 'ダメージ'}</small></button>
        ${hit.art ? `<button type="button" data-v="art" ${canArt ? '' : 'disabled'}>「${hit.art.name}」${costLabel(hit.art.cost, hit.art.fp)}<small>回避＋反撃の構え</small></button>` : ''}
        <button type="button" data-v="take">受ける<small>${hit.raw}ダメージ</small></button>
      </div>`);
    return v as Reaction;
  },

  askDiscard(hand, min, max, cardName) {
    return pickCards(
      `「${cardName}」で捨てるカード`,
      `${min === max ? `${min}枚` : `${min}〜${max}枚`}選んでください。捨てると発動するカードは、ここで発動します。`,
      hand.map((id) => ({ name: CARDS[id].name, sub: CARDS[id].onDiscard ? `捨てると発動：${CARDS[id].onDiscard!.text}` : CARDS[id].kind })),
      min, max,
    );
  },

  async askCounter(info, max) {
    const k = await askCount({
      head: `<p class="eyebrow">反撃の好機</p><h3>${esc(info.target.name)}に隙がある</h3>
        <p class="note">スタミナダイスを振り、${costLabel(info.cost)}を払えれば「${info.art.name}」で反撃する（リアクション不可）。</p>`,
      max, def: Math.min(max, 2), btn: 'まとめて振る', alt: '見送る',
    });
    return Math.max(0, k);
  },

  finished(playerWon) {
    const b = B!;
    setTimeout(async () => {
      await modal(`<div class="result"><p class="eyebrow">ラウンド ${b.round}</p><h3>${playerWon ? '勝利' : '敗北'}</h3></div>
        <p class="note">残りHP あなた ${b.p.hp}／${esc(b.e.name)} ${b.e.hp}</p>
        <div class="btns"><button type="button" class="primary" data-v="r">次へ</button></div>`);
      B = null;
      onExit(playerWon, b.p);
    }, 700);
  },
};

/* ---------------- 公開 ---------------- */

export interface BattleOptions {
  /** 持ち越したHP・FP（地下墓の部屋をまたぐとき） */
  hp?: number | null;
  fp?: number | null;
  /** 相手の最大HPの倍率 */
  foeHpRatio?: number;
  /** 手番の代わりに1回だけ行える特別な行動（血痕の回収など） */
  special?: SpecialAction;
  /** 降参したときの説明 */
  surrenderNote?: string;
}

let surrenderNote = 'この戦いは負けになります。';

export function startBattle(player: Character, foe: Character, exit: BattleEnd, opts: BattleOptions = {}): void {
  onExit = exit;
  sel = new Set();
  surrenderNote = opts.surrenderNote ?? 'この戦いは負けになります。';
  const me = makeFighter(player, true);
  if (opts.hp != null) me.hp = Math.min(me.maxHp, Math.max(1, opts.hp));
  if (opts.fp != null) me.fp = Math.min(me.maxFp, Math.max(0, opts.fp));
  B = new Battle(me, scaleHp(makeFighter(foe, false), opts.foeHpRatio), io);
  B.special = opts.special ?? null;
  show('battle');
  $('#log').innerHTML = '';
  hint('');
  render();
  void B.run();
}

export function bindBattle(): void {
  $('#battle').addEventListener('click', async (ev) => {
    const b = B;
    if (!b) return;
    const t = ev.target as HTMLElement;
    const d = t.closest<HTMLButtonElement>('[data-die]');
    if (d && !d.disabled) {
      const id = Number(d.dataset.die);
      if (sel.has(id)) sel.delete(id);
      else sel.add(id);
      hint('');
      render();
      return;
    }
    const a = t.closest<HTMLButtonElement>('[data-act]');
    if (a && !a.disabled) {
      if (a.dataset.act === 'weapon') void command((ids) => b.useWeapon(ids));
      else if (a.dataset.act === 'art') void command((ids) => b.useArt(ids));
      else if (a.dataset.act === 'end') b.endTurn();
      return;
    }
    const c = t.closest<HTMLButtonElement>('[data-card]');
    if (c && !c.disabled) {
      void command((ids) => b.useCard(Number(c.dataset.card), ids));
      return;
    }
    if (t.closest('#surrender') && b.canAct()) {
      const v = await modal(`<h3>降参する？</h3><p class="note">${surrenderNote}</p>
        <div class="btns"><button type="button" data-v="y">降参する</button><button type="button" class="primary" data-v="n">続ける</button></div>`);
      if (v === 'y' && b.surrender()) {
        B = null;
        onExit(false, b.p);
      }
    }
  });
}
