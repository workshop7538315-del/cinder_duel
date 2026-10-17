import { CARDS } from '../data/cards';
import { SHIELDS, WEAPONS, WEIGHTS } from '../data/equipment';
import { RULES } from '../data/rules';
import { CLASSES, ENEMIES, STAT_NAMES } from '../data/fighters';
import { derive } from '../engine/fighter';
import { costLabel, typeName } from '../engine/format';
import { scaleLabel, scaled } from '../engine/scaling';
import type { Die, Fighter, FighterDef, StatKey, Stats } from '../engine/types';
import { Battle, type BattleIO, type IncomingHit, type LogKind, type Reaction } from '../game/battle';
import { makeFighter } from '../game/setup';
import { askCount, modal } from './modal';

const $ = <T extends HTMLElement = HTMLElement>(s: string): T => {
  const el = document.querySelector<T>(s);
  if (!el) throw new Error(`missing element ${s}`);
  return el;
};

let B: Battle | null = null;
let sel = new Set<number>();
const ENEMY = ENEMIES.sentinel;

/* ---------------- 部品 ---------------- */

const PIPS: Record<number, number[]> = {
  1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
};
export function dieHTML(v: number, cls = '', tag = 'span', attrs = ''): string {
  const cells = Array.from({ length: 9 }, (_, i) => `<i class="${PIPS[v].includes(i) ? 'p' : ''}"></i>`).join('');
  return `<${tag} class="die ${cls}" ${attrs} aria-label="${v}">${cells}</${tag}>`;
}

function log(text: string, kind: LogKind = 'sys'): void {
  const el = $('#log');
  const p = document.createElement('p');
  p.className = kind;
  p.textContent = text;
  el.appendChild(p);
  while (el.children.length > 80) el.firstChild?.remove();
  el.scrollTop = el.scrollHeight;
}
const hint = (t: string) => ($('#hint').textContent = t);
function flash(f: Fighter): void {
  const el = f.isPlayer ? $('#mePanel') : $('#foePanel');
  el.classList.remove('hit');
  void el.offsetWidth;
  el.classList.add('hit');
}
const equipName = (weapon: string, shield: string | null) => {
  const w = WEAPONS[weapon].name;
  return shield ? `${w}＋${SHIELDS[shield].name}` : w;
};

/* ---------------- 戦闘画面 ---------------- */

function panelHTML(b: Battle, f: Fighter): string {
  const bar = (c: string, v: number, m: number) =>
    `<div class="bar ${c}"><i style="width:${m ? Math.max(0, (v / m) * 100) : 0}%"></i></div>`;
  const sq = Array.from({ length: f.stMax }, (_, i) => `<span class="sq ${i < f.stamina ? 'on' : ''}"></span>`).join('');
  const chips: string[] = [];
  if (f.speed) chips.push(`<span class="chip">速度 ${f.speed}</span>`);
  if (b.turn === f) chips.push(`<span class="chip turn">手番</span>`);
  if (f.buffs.stance) chips.push(`<span class="chip buff">構え</span>`);
  if (f.buffs.oil) chips.push(`<span class="chip buff">焼き油</span>`);
  if (f.buffs.broken) chips.push(`<span class="chip debuff">体勢崩し</span>`);
  const md = !f.isPlayer && f.action.length
    ? `<span class="minidice">${f.action.map((d) => dieHTML(d.v)).join('')}</span>` : '';
  return `<div class="ph"><span class="nm">${f.isPlayer ? 'あなた・' + f.name : f.name}</span>
      <span class="wt">${f.weight.name}・${f.weapon.name}${f.shield ? '＋' + f.shield.name : ''}</span></div>
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
  const w = p.weapon;
  const a = w.art;
  const oil = p.buffs.oil ? RULES.oilBonus : 0;
  const wCost = b.weaponCost();
  $('#actions').innerHTML = `
    <button type="button" class="act" data-act="weapon" ${wCost && b.canPay(wCost) ? '' : 'disabled'}>
      <span class="an">${wCost ? `武器攻撃・${p.chain + 1}段目` : '連撃はここまで'}</span>
      <span class="ac">${wCost ? costLabel(wCost) : '—'}</span>
      <span class="ad">${typeName(w.type)}${scaled(w.dmg, p.stats) + oil}・最大${w.maxChain}段（+${w.inc}ずつ重く）・${scaleLabel(w.dmg)}</span></button>
    <button type="button" class="act" data-act="art" ${b.canPay(a.cost, a.fp) ? '' : 'disabled'}>
      <span class="an">戦技「${a.name}」</span>
      <span class="ac">${costLabel(a.cost, a.fp)}</span>
      <span class="ad">${typeName(a.type)}${scaled(a.dmg, p.stats) + oil}${a.unguardable ? '・ガード不可' : ''}・${scaleLabel(a.dmg)}</span></button>
    <button type="button" class="act end" data-act="end" ${myAct ? '' : 'disabled'}>手番を終える</button>`;

  // 手札
  $('#hand').innerHTML = p.hand.length
    ? p.hand.map((id, i) => {
        const c = CARDS[id];
        const ok = b.canPay(c.cost, c.fp ?? 0);
        return `<button type="button" class="card" data-card="${i}" ${ok ? '' : 'disabled'}>
          <span class="k">${c.kind}</span><span class="n">${c.name}</span>
          <span class="c">${costLabel(c.cost, c.fp)}</span><span class="t">${c.text(p)}</span></button>`;
      }).join('')
    : '<span class="empty">手札なし</span>';
  $('#deckNote').textContent = `山札 ${p.deck.length}・捨て札 ${p.discard.length}`;
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

function bindBattle(): void {
  $('#battle').addEventListener('click', (ev) => {
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
    if (c && !c.disabled) void command((ids) => b.useCard(Number(c.dataset.card), ids));
  });
}

/* ---------------- 入出力（Battle → 画面） ---------------- */

function reactHead(hit: IncomingHit): string {
  const o = hit.attack;
  return `<p class="eyebrow">リアクション</p><h3>${hit.attacker.name}の${o.label}</h3>
    <p class="incoming">${typeName(o.type)} <b>${hit.raw}</b>${o.unguardable ? '　ガード不可' : ''}</p>
    <ul class="opts"><li>回避 [${hit.dodgeCost}] → 0ダメージ</li>
    <li>${o.unguardable ? 'ガードはできない' : `ガード [${hit.guardCost}] → ${hit.guardDmg}ダメージ（カット${Math.round(hit.guardCut * 100)}%）`}</li></ul>`;
}

const io: BattleIO = {
  log,
  update: render,
  flash,
  wait: (ms) => new Promise((r) => setTimeout(r, ms)),

  async askDraw() {
    const p = B!.p;
    const v = await modal(`<p class="eyebrow">ラウンド ${B!.round}</p><h3>カードを引く？</h3>
      <p class="note">スタミナダイス ${p.stamina}／${p.stMax}・手札 ${p.hand.length}枚。払ったダイスはこのラウンドの攻防に使えません。</p>
      <div class="btns"><button type="button" class="primary" data-v="y">1個払って1枚引く</button><button type="button" data-v="n">引かない</button></div>`);
    return v === 'y';
  },

  askTurnDice(max, suggested) {
    return askCount({
      title: 'あなたの手番',
      text: '振ったダイスは手番終了時に消えます。振らなかった分は相手の攻撃へのリアクション用に残ります。',
      max, def: suggested, btn: 'まとめて振る',
    });
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

  async askReactChoice(hit, dice: Die[], canDodge, canGuard) {
    const ung = hit.attack.unguardable;
    const v = await modal(`<p class="eyebrow">リアクション</p><h3>出目：${dice.map((d) => d.v).join('・')}</h3>
      <div class="dice">${dice.map((d) => dieHTML(d.v, 'new')).join('')}</div>
      <p class="note">使わなかったダイスは消えます。</p>
      <div class="btns">
        <button type="button" data-v="dodge" class="${canDodge ? 'primary' : ''}" ${canDodge ? '' : 'disabled'}>回避 [${hit.dodgeCost}]<small>0ダメージ</small></button>
        <button type="button" data-v="guard" ${canGuard ? '' : 'disabled'}>${ung ? 'ガード不可' : `ガード [${hit.guardCost}]`}<small>${ung ? '' : hit.guardDmg + 'ダメージ'}</small></button>
        <button type="button" data-v="take">受ける<small>${hit.raw}ダメージ</small></button>
      </div>`);
    return v as Reaction;
  },

  finished(playerWon) {
    const b = B!;
    setTimeout(async () => {
      await modal(`<div class="result"><p class="eyebrow">ラウンド ${b.round}</p><h3>${playerWon ? '勝利' : '敗北'}</h3></div>
        <p class="note">残りHP あなた ${b.p.hp}／${b.e.name} ${b.e.hp}</p>
        <div class="btns"><button type="button" class="primary" data-v="r">素性を選び直す</button></div>`);
      $('#battle').hidden = true;
      $('#select').hidden = false;
      window.scrollTo(0, 0);
    }, 700);
  },
};

/* ---------------- 選択画面 ---------------- */

function statsHTML(s: Stats): string {
  return `<div class="stats">${(Object.keys(STAT_NAMES) as StatKey[])
    .map((k) => `<span>${STAT_NAMES[k]}<b>${s[k]}</b></span>`).join('')}</div>`;
}
function derivedText(def: FighterDef): string {
  const d = derive(def.stats);
  const wt = WEIGHTS[def.weight];
  return `HP ${d.maxHp}・FP ${d.maxFp}・スタミナ 初期${d.stInit}／上限${d.stMax}・速度 ${wt.speedDice}d6・回避[${wt.dodge}]・武器${scaleLabel(WEAPONS[def.weapon].dmg)}`;
}

function startBattle(key: string): void {
  sel = new Set();
  B = new Battle(makeFighter(CLASSES[key], true), makeFighter(ENEMY, false), io);
  $('#select').hidden = true;
  $('#battle').hidden = false;
  $('#log').innerHTML = '';
  hint('');
  render();
  void B.run();
}

export function initApp(): void {
  $('#classes').innerHTML = Object.entries(CLASSES)
    .map(([k, c]) => `
      <button type="button" class="cls" data-cls="${k}">
        <span class="top"><h2>${c.name}</h2><span class="eq">${WEIGHTS[c.weight].name}・${equipName(c.weapon, c.shield)}</span></span>
        <p class="bl">${c.blurb ?? ''}</p>${statsHTML(c.stats)}<span class="derived">${derivedText(c)}</span>
      </button>`)
    .join('');
  $('#foeNote').textContent = `相手：${ENEMY.name}（${WEAPONS[ENEMY.weapon].name}・${derivedText(ENEMY)}）`;
  $('#classes').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-cls]');
    if (b?.dataset.cls) startBattle(b.dataset.cls);
  });
  bindBattle();
}
