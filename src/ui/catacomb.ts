import { charLevel, checkCharacter, loadout, type Character } from '../character/model';
import { CARDS } from '../data/cards';
import { CATACOMBS, type LootDef } from '../data/catacombs';
import { ARMORS, SHIELDS, WEAPONS } from '../data/equipment';
import { generateDungeon, ROOM_NAMES, type Dungeon } from '../dungeon/generate';
import { randomSeed } from '../dungeon/rng';
import {
  bankRun, currentRoom, leaveBonfire, loseBattle, openChest, rest, retreat, roomNumber, startRun, winBattle,
  type Banked, type RunState,
} from '../dungeon/run';
import { clearRun, loadRun, saveRun } from '../dungeon/save';
import { startBattle } from './battle';
import { $, esc, show } from './dom';
import { findCharacter, upsertCharacter } from './state';

let charId: string | null = null;
let catacombId = 'knight';
let seed = randomSeed();
let onBack: () => void = () => {};

let dungeon: Dungeon | null = null;
let run: RunState | null = null;
/** 宝箱を開けた直後などに一度だけ出す知らせ */
let notice = '';
/** 探索が終わったときの結果 */
let result: { run: RunState; banked: Banked } | null = null;
let confirmAbandon = false;

export const lootName = (l: LootDef): string =>
  l.kind === 'card' ? `カード「${CARDS[l.id].name}」` : (WEAPONS[l.id] ?? SHIELDS[l.id] ?? ARMORS[l.id]).name;
const stars = (q: number) => '★'.repeat(1 + Math.round(q * 2)) + '☆'.repeat(2 - Math.round(q * 2));

export const hasActiveRun = (id: string): boolean => !!loadRun(id);

/* ---------------- 地下墓を選ぶ ---------------- */

export function openCatacombs(id: string, back: () => void): void {
  charId = id;
  onBack = back;
  const saved = loadRun(id);
  if (saved) return resumeRun(saved);
  show('dungeon');
  renderSelect();
}

function renderSelect(): void {
  const c = charId ? findCharacter(charId) : undefined;
  if (!c) return onBack();
  const lv = charLevel(c);
  const d = generateDungeon(catacombId, seed || 'x', lv);
  const bad = checkCharacter(c).errors.length > 0;
  $('#dgBody').innerHTML = `
    <div class="vs-me"><p class="eyebrow">挑む者</p><b>${esc(c.name)}</b><span>Lv${lv}・ソウル ${c.souls}</span></div>
    <p class="note">手に入れたものとソウルは、主を倒すか、篝火から退却したときに持ち帰れます。途中で倒れると、その探索で得たものはすべて失います。</p>
    <div class="cat-list">${Object.entries(CATACOMBS).map(([id, k]) => `
      <button type="button" class="cat ${id === catacombId ? 'on' : ''}" data-cat="${id}" aria-pressed="${id === catacombId}">
        <b>${k.name}</b><span>${k.blurb}</span></button>`).join('')}</div>
    <div class="seed-row">
      <label for="dgSeed">シード</label>
      <div class="seed-in"><input id="dgSeed" value="${esc(seed)}" maxlength="24" autocomplete="off" spellcheck="false">
        <button type="button" class="btn" data-seed="new">変える</button></div>
      <p class="note">同じ地下墓・同じシードなら、同じ間取りと宝になります。敵の強さはあなたのレベルに合わせて変わります。</p>
    </div>
    <div class="preview">
      <div class="pv-h"><span>${d.floors.length}階層・全${d.totalRooms}部屋</span><span class="pv-q" title="長いほど良いものが出やすい">報酬 ${stars(d.quality)}</span></div>
      ${mapHTML(d, null)}
    </div>
    ${bad ? '<p class="warn">キャラクターに直すところがあります。編集してから挑んでください。</p>' : ''}
    <button type="button" class="btn primary big" id="dgGo" ${bad ? 'disabled' : ''}>入る</button>`;
}

function mapHTML(d: Dungeon, r: RunState | null): string {
  return `<ol class="floors">${d.floors.map((f, fi) => `
    <li><span class="fl">地下${fi + 1}層</span><ol class="rooms">${f.map((room, ri) => {
      const here = r && r.floor === fi && r.room === ri;
      const done = r && (fi < r.floor || (fi === r.floor && ri < r.room));
      return `<li class="rm rm-${room.kind} ${here ? 'here' : ''} ${done ? 'done' : ''}">${ROOM_NAMES[room.kind]}</li>`;
    }).join('')}</ol></li>`).join('')}</ol>`;
}

function enter(): void {
  const c = charId ? findCharacter(charId) : undefined;
  if (!c || checkCharacter(c).errors.length) return;
  const s = seed.trim() || randomSeed();
  dungeon = generateDungeon(catacombId, s, charLevel(c));
  run = startRun(c.id, dungeon);
  result = null;
  notice = '';
  saveRun(run);
  show('run');
  renderRun();
}

function resumeRun(saved: RunState): void {
  run = saved;
  dungeon = generateDungeon(saved.catacombId, saved.seed, saved.level);
  catacombId = saved.catacombId;
  result = null;
  notice = '探索の途中から再開しました。';
  show('run');
  renderRun();
}

/* ---------------- 探索 ---------------- */

function bar(cls: string, v: number, m: number): string {
  return `<div class="bar ${cls}"><i style="width:${m ? Math.max(0, (v / m) * 100) : 0}%"></i></div>`;
}

function renderRun(): void {
  const c = charId ? findCharacter(charId) : undefined;
  if (!c || !dungeon || !run) return onBack();
  const cat = CATACOMBS[dungeon.catacombId];
  const lo = loadout(c);
  const maxHp = lo.derived.maxHp;
  const maxFp = lo.derived.maxFp;
  const hp = run.hp ?? maxHp;
  const fp = run.fp ?? maxFp;

  const head = `<div class="run-h"><div><p class="eyebrow">シード ${esc(dungeon.seed)}</p><h1 class="page-h">${cat.name}</h1></div>
    <span class="lv">${Math.min(roomNumber(dungeon, run), dungeon.totalRooms)} / ${dungeon.totalRooms}部屋</span></div>`;

  if (result) {
    $('#runBody').innerHTML = head + resultHTML(result);
    return;
  }

  const status = `<div class="panel">
    <div class="ph"><span class="nm">${esc(c.name)} <small>Lv${lo.level}</small></span><span class="wt">持ち帰り予定 ソウル ${run.souls}</span></div>
    <div class="row"><span class="lbl">HP</span>${bar('hp', hp, maxHp)}<span class="num">${hp}/${maxHp}</span></div>
    <div class="row"><span class="lbl">FP</span>${bar('fp', fp, maxFp)}<span class="num">${fp}/${maxFp}</span></div>
    ${run.loot.length ? `<p class="note">拾ったもの：${run.loot.map(lootName).join('、')}</p>` : ''}
  </div>`;

  const room = currentRoom(dungeon, run)!;
  let action = '';
  if (room.kind === 'battle' || room.kind === 'boss') {
    const e = room.enemy!;
    action = `<div class="room-card rk-${room.kind}"><p class="eyebrow">${room.kind === 'boss' ? 'この地下墓の主' : '敵'}</p>
      <b>${esc(e.name)}</b><span>Lv${charLevel(e)}・${[loadout(e).right.name, loadout(e).left?.name].filter(Boolean).join('＋')}</span>
      <button type="button" class="btn primary big" data-run="fight">戦う</button></div>`;
  } else if (room.kind === 'chest') {
    action = `<div class="room-card rk-chest"><p class="eyebrow">宝箱</p><b>古びた宝箱がある</b>
      <button type="button" class="btn primary big" data-run="open">開ける</button></div>`;
  } else {
    const rested = run.hp === null && run.fp === null;
    action = `<div class="room-card rk-bonfire"><p class="eyebrow">篝火</p><b>篝火が灯っている</b>
      <span>休むとHPとFPが最大に戻ります。ここから退却すれば、拾ったものとソウルを持ち帰れます。</span>
      <div class="btns">
        <button type="button" class="btn ${rested ? '' : 'primary'}" data-run="rest" ${rested ? 'disabled' : ''}>${rested ? '休んだ' : '休む'}</button>
        <button type="button" class="btn ${rested ? 'primary' : ''}" data-run="next">先へ進む（地下${run.floor + 2}層へ）</button>
        <button type="button" class="btn" data-run="retreat">退却する（持ち帰る）</button>
      </div></div>`;
  }

  const abandon = confirmAbandon
    ? `<div class="row-btns"><button type="button" class="btn danger" data-run="abandon-yes">諦めて出る（何も持ち帰れない）</button><button type="button" class="btn" data-run="abandon-no">やめる</button></div>`
    : `<button type="button" class="btn quiet" data-run="abandon">探索を諦める</button>`;

  $('#runBody').innerHTML = `${head}
    ${notice ? `<p class="notice" role="status">${esc(notice)}</p>` : ''}
    ${status}
    ${action}
    <div class="preview">${mapHTML(dungeon, run)}</div>
    ${abandon}`;
}

function resultHTML({ run: r, banked }: { run: RunState; banked: Banked }): string {
  const title = r.status === 'cleared' ? '踏破' : r.status === 'retreated' ? '退却' : 'あなたは倒れた';
  const kept = r.status === 'dead'
    ? `<p class="note">この探索で得たソウルと拾ったものは、すべて失われました。</p>`
    : `<ul class="gains">
        <li>ソウル <b>+${banked.souls}</b></li>
        ${banked.items.map((id) => `<li>装備「${(WEAPONS[id] ?? SHIELDS[id] ?? ARMORS[id]).name}」を手に入れた</li>`).join('')}
        ${banked.cards.map((id) => `<li>カード「${CARDS[id].name}」を手に入れた</li>`).join('')}
        ${banked.dupes.map((id) => `<li>「${(WEAPONS[id] ?? SHIELDS[id] ?? ARMORS[id]).name}」はすでに持っていたのでソウルに替えた</li>`).join('')}
      </ul>`;
  return `<div class="result-card ${r.status}"><h2>${title}</h2>${kept}
    <button type="button" class="btn primary big" data-run="done">戻る</button></div>`;
}

function finish(next: RunState): void {
  const c = charId ? findCharacter(charId) : undefined;
  run = next;
  clearRun(next.charId);
  if (!c) return onBack();
  const { character, banked } = bankRun(c, next);
  if (next.status !== 'dead') upsertCharacter(character);
  result = { run: next, banked };
  show('run');
  renderRun();
}

function step(next: RunState, msg = ''): void {
  run = next;
  notice = msg;
  confirmAbandon = false;
  if (next.status !== 'active') return finish(next);
  saveRun(next);
  show('run');
  renderRun();
}

function fight(): void {
  const c = charId ? findCharacter(charId) : undefined;
  if (!c || !dungeon || !run) return;
  const room = currentRoom(dungeon, run)!;
  const d = dungeon;
  const r = run;
  startBattle(c, room.enemy!, (won, me) => {
    if (won) {
      const gotLoot = room.loot ? `「${lootName(room.loot)}」を拾った。` : '';
      step(winBattle(d, r, me.hp, me.fp), `${room.enemy!.name}を倒した。ソウル +${room.souls}。${gotLoot}`);
    } else {
      step(loseBattle(r));
    }
  }, { hp: r.hp, fp: r.fp, foeHpRatio: room.hpRatio, surrenderNote: '地下墓で降参すると倒れたことになり、この探索で得たものをすべて失います。' });
}

/* ---------------- 操作 ---------------- */

export function bindCatacombs(): void {
  $('#dgBody').addEventListener('click', (ev) => {
    const t = ev.target as HTMLElement;
    const cat = t.closest<HTMLElement>('[data-cat]');
    if (cat) {
      catacombId = cat.dataset.cat!;
      return renderSelect();
    }
    if (t.closest('[data-seed]')) {
      seed = randomSeed();
      return renderSelect();
    }
    if (t.closest('#dgGo')) enter();
  });
  $('#dgBody').addEventListener('change', (ev) => {
    const t = ev.target as HTMLInputElement;
    if (t.id === 'dgSeed') {
      seed = t.value.trim().slice(0, 24);
      renderSelect();
    }
  });
  $('#dgBack').addEventListener('click', () => onBack());

  $('#runBody').addEventListener('click', (ev) => {
    const act = (ev.target as HTMLElement).closest<HTMLElement>('[data-run]')?.dataset.run;
    if (!act || !dungeon || !run) return;
    const room = currentRoom(dungeon, run);
    switch (act) {
      case 'fight':
        return fight();
      case 'open':
        return step(openChest(dungeon, run),
          room?.loot ? `宝箱から「${lootName(room.loot)}」を見つけた。` : `宝箱にはソウルが残っていた。ソウル +${room?.souls ?? 0}。`);
      case 'rest':
        return step(rest(run), '篝火で休んだ。HPとFPが戻った。');
      case 'next':
        return step(leaveBonfire(dungeon, run), `地下${run.floor + 2}層へ降りた。`);
      case 'retreat':
        return step(retreat(run));
      case 'abandon':
        confirmAbandon = true;
        return renderRun();
      case 'abandon-no':
        confirmAbandon = false;
        return renderRun();
      case 'abandon-yes':
        return step(loseBattle(run));
      case 'done':
        result = null;
        dungeon = null;
        run = null;
        return onBack();
    }
  });
}

export function characterInRun(c: Character): boolean {
  return hasActiveRun(c.id);
}
