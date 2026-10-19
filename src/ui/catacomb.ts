import { charLevel, checkCharacter, loadout, loseLevels, type Character } from '../character/model';
import { CARDS } from '../data/cards';
import { CATACOMBS, type LootDef } from '../data/catacombs';
import { ARMORS, SHIELDS, WEAPONS } from '../data/equipment';
import { ABYSS } from '../data/abyss';
import { FIXED_CATACOMBS } from '../data/fixed';
import {
  abyssFromSeed, abyssName, abyssSeed, ABYSS_KEYS, buildAbyss, fixedFromSeed, SEA_KEY, generateDungeon, normalizeSeed, pickAbyss, rebuildDungeon, ROOM_NAMES, strayInto, versionedSeed,
  type Dungeon,
} from '../dungeon/generate';
import { randomSeed } from '../dungeon/rng';
import {
  abandon, bankRun, currentRoom, isLooted, leaveBonfire, loseBattle, openChest, rest, retreat, retrieveStain, roomNumber,
  securedLoot, stainHere, startRun, winBattle,
  type Banked, type RunState,
} from '../dungeon/run';
import { clearRun, loadRun, loadSeedHistory, rememberSeed, saveRun } from '../dungeon/save';
import { startBattle } from './battle';
import { $, esc, show } from './dom';
import { findCharacter, upsertCharacter } from './state';

let charId: string | null = null;
let seed = versionedSeed(randomSeed());
/** 用意されたシードのまま（手で変えていない）か。そのまま入ると、まれに困難な地下墓に迷い込む */
let seedAuto = true;
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
export const stars = (q: number) => '★'.repeat(1 + Math.round(q * 2)) + '☆'.repeat(2 - Math.round(q * 2));

export const hasActiveRun = (id: string): boolean => !!loadRun(id);

/* ---------------- 地下墓を選ぶ ---------------- */

export function openCatacombs(id: string, back: () => void): void {
  charId = id;
  onBack = back;
  const saved = loadRun(id);
  if (saved) return resumeRun(saved);
  // どの地下墓に入るかはシードで決まる。毎回ちがうシードを用意しておく
  seed = versionedSeed(randomSeed());
  seedAuto = true;
  show('dungeon');
  renderSelect();
}

function renderSelect(): void {
  const c = charId ? findCharacter(charId) : undefined;
  if (!c) return onBack();
  const lv = charLevel(c);
  const bad = checkCharacter(c).errors.length > 0;
  const history = loadSeedHistory();
  const cur = normalizeSeed(seed);
  $('#dgBody').innerHTML = `
    <div class="vs-me"><p class="eyebrow">挑む者</p><b>${esc(c.name)}</b><span>Lv${lv}・ソウル ${c.souls}</span></div>
    <p class="note">手に入れたものとソウルは、主を倒すか、篝火から退却したときに持ち帰れます。途中で倒れると、その探索で得たものはすべて失います。</p>
    <div class="seed-row">
      <label for="dgSeed">シード</label>
      <div class="seed-in"><input id="dgSeed" value="${esc(seed)}" maxlength="24" autocomplete="off" spellcheck="false">
        <button type="button" class="btn" data-seed="new">変える</button></div>
      <p class="note">どの地下墓に入るかは、シードで決まります。入るまでどこかはわかりません。同じシードを入れれば、同じ地下墓・同じ間取りと宝になります（敵の強さはあなたのレベルに合わせて変わります）。</p>
    </div>
    ${history.length ? `<div class="seed-hist"><p class="eyebrow">行ったことのあるシード</p>
      ${history.map((h) => `<button type="button" class="hist ${h.seed === cur ? 'on' : ''}" data-hist="${esc(h.seed)}">
        <b>${dungeonName(h.catacombId)}</b><span>${h.catacombId.startsWith('fixed:') ? '困難・' : ''}${h.rooms}部屋・報酬 ${h.catacombId.startsWith('fixed:') ? '★★★' : stars(roomsQuality(h.rooms))}</span><code>${esc(h.seed)}</code></button>`).join('')}</div>` : ''}
    ${clueHTML(c)}
    ${abyssHTML(c)}
    ${bad ? '<p class="warn">キャラクターに直すところがあります。編集してから挑んでください。</p>' : ''}
    <button type="button" class="btn primary big" id="dgGo" ${bad ? 'disabled' : ''}>入る</button>`;
}

/** 地下墓の名前（困難な地下墓も含む） */
export const dungeonName = (id: string): string =>
  id.startsWith('fixed:') ? FIXED_CATACOMBS[id.slice(6)]?.name ?? '？'
    : id.startsWith('abyss:') ? abyssName(id.slice(6)) ?? '？'
    : CATACOMBS[id]?.name ?? '？';

/** 踏破した底（シードで直接入れる） */
function abyssHTML(c: Character): string {
  const known = ABYSS_KEYS.filter((k) => (c.abyssCleared ?? []).includes(k));
  if (!known.length) return '';
  return `<div class="seed-hist"><p class="eyebrow">踏破した底</p>
    ${known.map((k) => {
      const sd = abyssSeed(k)!;
      return `<button type="button" class="hist hard ${normalizeSeed(seed) === sd ? 'on' : ''}" data-hist="${esc(sd)}">
        <b>${abyssName(k)}</b><span>高難度・${k === SEA_KEY ? '2階層9部屋' : '1階層3部屋'}・敵はあなたのレベルより上</span><code>${esc(sd)}</code></button>`;
    }).join('')}</div>`;
}

/** 底の主（倒さずに出るとレベルを失う相手）の呼び名 */
const abyssBoss = (key: string) => (key === SEA_KEY ? '海淵の大蛇' : '盗掘者狩り');

/** 手がかりで知っている困難な地下墓 */
function clueHTML(c: Character): string {
  const known = (c.clues ?? []).filter((k) => FIXED_CATACOMBS[k]);
  if (!known.length) return '';
  return `<div class="seed-hist"><p class="eyebrow">手がかり（困難な地下墓）</p>
    ${known.map((k) => {
      const f = FIXED_CATACOMBS[k];
      return `<button type="button" class="hist hard ${normalizeSeed(seed) === f.seed ? 'on' : ''}" data-hist="${esc(f.seed)}">
        <b>${f.name}</b><span>困難・推奨Lv${f.recommendedLevel}・${f.blurb}</span><code>${esc(f.seed)}</code></button>`;
    }).join('')}</div>`;
}

/** 部屋数から報酬の目安（generate と同じ式） */
const roomsQuality = (n: number) => Math.max(0, Math.min(1, (n - 3) / 12));

function mapHTML(d: Dungeon, r: RunState | null): string {
  return `<ol class="floors">${d.floors.map((f, fi) => `
    <li><span class="fl">地下${fi + 1}層</span><ol class="rooms">${f.map((room, ri) => {
      const here = r && r.floor === fi && r.room === ri;
      const done = r && (fi < r.floor || (fi === r.floor && ri < r.room));
      const stain = r?.stain && r.stain.floor === fi && r.stain.room === ri;
      return `<li class="rm rm-${room.kind} ${here ? 'here' : ''} ${done ? 'done' : ''} ${stain ? 'stain' : ''}"${stain ? ` title="血痕（ソウル ${r!.stain!.souls}）"` : ''}>${ROOM_NAMES[room.kind]}${stain ? '<i aria-label="血痕"></i>' : ''}</li>`;
    }).join('')}</ol></li>`).join('')}</ol>`;
}

function enter(): void {
  const c = charId ? findCharacter(charId) : undefined;
  if (!c || checkCharacter(c).errors.length) return;
  let s = normalizeSeed(seed) || versionedSeed(randomSeed());
  // 踏破した底は、そのシードで直接入れる
  const direct = abyssFromSeed(s);
  if (direct) {
    if (!(c.abyssCleared ?? []).includes(direct)) {
      $('#dgBody').insertAdjacentHTML('afterbegin', '<p class="warn">まだ踏破していない底には、シードでは入れません。</p>');
      return;
    }
    dungeon = buildAbyss(direct, randomSeed(), charLevel(c));
    run = startRun(c.id, dungeon);
    notice = `${dungeon.name}へ降りた。${abyssBoss(direct)}を倒さずに脱出すると、レベルを${ABYSS.escapeLevelLoss}失う。`;
    result = null;
    saveRun(run);
    show('run');
    return renderRun();
  }
  // 用意されたシードのまま入ると、まれに困難な地下墓に迷い込む
  const stray = seedAuto ? strayInto() : null;
  if (stray) s = stray;
  try {
    dungeon = generateDungeon(s, charLevel(c));
  } catch (e) {
    $('#dgBody').insertAdjacentHTML('afterbegin', `<p class="warn">${esc(e instanceof Error ? e.message : 'このシードでは入れません。')}</p>`);
    return;
  }
  // 困難な地下墓のシードを自分で入れたときは、入れるのはまれ。入りそこねると底に落ちる
  const target = !stray ? fixedFromSeed(s) : null;
  if (target && Math.random() >= ABYSS.fixedEntryChance) {
    const key = pickAbyss();
    dungeon = buildAbyss(key, randomSeed(), charLevel(c));
    run = { ...startRun(c.id, dungeon), from: target };
    notice = key === SEA_KEY
      ? `「${FIXED_CATACOMBS[target].name}」への道を踏み外し、底を突き抜けて${dungeon.name}まで沈んだ。光が届かない。${abyssBoss(key)}を倒さずに脱出すると、レベルを${ABYSS.escapeLevelLoss}失う。`
      : `「${FIXED_CATACOMBS[target].name}」への道を踏み外し、${dungeon.name}に落ちた。バジリスクの気配がする。${abyssBoss(key)}を倒さずに脱出すると、レベルを${ABYSS.escapeLevelLoss}失う。`;
  } else {
    run = startRun(c.id, dungeon);
    rememberSeed({ seed: s, catacombId: dungeon.catacombId, rooms: dungeon.totalRooms, at: Date.now() });
    if (dungeon.rank === '困難') learnClue(c, dungeon.catacombId.slice(6));
    notice = `${stray ? '道に迷い、' : target ? '道を見失わずに、' : ''}${dungeon.name}に入った。${dungeon.rank === '困難' ? '【困難】' : ''}${dungeon.floors.length}階層・全${dungeon.totalRooms}部屋。`;
  }
  result = null;
  saveRun(run);
  show('run');
  renderRun();
}

function resumeRun(saved: RunState): void {
  run = saved;
  dungeon = rebuildDungeon(saved.catacombId, saved.seed, saved.level);
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
  const lo = loadout(c);
  const maxHp = lo.derived.maxHp;
  const maxFp = lo.derived.maxFp;
  const hp = run.hp ?? maxHp;
  const fp = run.fp ?? maxFp;

  const head = `<div class="run-h"><div><p class="eyebrow">シード ${esc(dungeon.seed)}</p><h1 class="page-h">${dungeon.name}${dungeon.rank !== '通常' ? ` <span class="rank">${dungeon.rank === '底' ? '高難度' : '困難'}</span>` : ''}</h1></div>
    <span class="lv">${Math.min(roomNumber(dungeon, run), dungeon.totalRooms)} / ${dungeon.totalRooms}部屋</span></div>`;

  if (result) {
    $('#runBody').innerHTML = head + (notice ? `<p class="notice" role="status">${esc(notice)}</p>` : '') + resultHTML(result);
    return;
  }

  const status = `<div class="panel">
    <div class="ph"><span class="nm">${esc(c.name)} <small>Lv${lo.level}</small></span><span class="wt">持ち帰り予定 ソウル ${run.souls}</span></div>
    <div class="row"><span class="lbl">HP</span>${bar('hp', hp, maxHp)}<span class="num">${hp}/${maxHp}</span></div>
    <div class="row"><span class="lbl">FP</span>${bar('fp', fp, maxFp)}<span class="num">${fp}/${maxFp}</span></div>
    ${run.loot.length ? `<p class="note">拾ったもの：${run.loot.map((l) => {
      const safe = securedLoot({ ...run!, status: 'retreated' }).includes(l);
      return `<span class="${safe ? 'safe' : 'unsafe'}" title="${safe ? '退却しても持ち帰れる' : 'この階層の主を倒すまで、退却では持ち帰れない'}">${lootName(l)}${safe ? '✓' : ''}</span>`;
    }).join('、')}</p>
    <p class="note dim">✓ は主を倒した階層で拾ったもの。退却で持ち帰れるのはこれだけです。</p>` : ''}
  </div>`;

  const room = currentRoom(dungeon, run)!;
  let action = '';
  if (room.kind === 'battle' || room.kind === 'boss') {
    const e = room.enemy!;
    const finalBoss = room.kind === 'boss' && run.floor === dungeon.floors.length - 1;
    action = `<div class="room-card rk-${room.kind}"><p class="eyebrow">${room.kind === 'boss' ? (finalBoss ? 'この地下墓の主' : `地下${run.floor + 1}層の主`) : '敵'}</p>
      <b>${esc(e.name)}</b><span>Lv${charLevel(e)}・${[loadout(e).right.name, loadout(e).left?.name].filter(Boolean).join('＋')}</span>
      ${dangerNote(e)}
      ${stainHere(run) ? `<p class="stain-note">ここにあなたの血痕がある（ソウル ${stainHere(run)!.souls}）。この部屋の敵に勝てば取り戻せる。戦闘中に手番の初めの「ソウルを回収する」で先に取り戻しておけば、この戦いで倒れても失わない（ここに落とし直す）。回収しないまま倒れると失われる。</p>` : ''}
      <button type="button" class="btn primary big" data-run="fight">戦う</button></div>`;
  } else if (room.kind === 'chest') {
    action = isLooted(run)
      ? `<div class="room-card rk-chest"><p class="eyebrow">宝箱</p><b>開けた宝箱がある</b><span>中身はもう取った。</span>
      <button type="button" class="btn primary big" data-run="open">先へ進む</button></div>`
      : `<div class="room-card rk-chest"><p class="eyebrow">宝箱</p><b>古びた宝箱がある</b>
      <button type="button" class="btn primary big" data-run="open">開ける</button></div>`;
  } else {
    const rested = run.hp === null && run.fp === null;
    action = `<div class="room-card rk-bonfire"><p class="eyebrow">篝火</p><b>篝火が灯っている</b>
      <span>休むとHPとFPが最大に戻ります。ここから退却すると、ソウルと、主を倒した階層で拾ったものを持ち帰れます。</span>
      <div class="btns">
        <button type="button" class="btn ${rested ? '' : 'primary'}" data-run="rest" ${rested ? 'disabled' : ''}>${rested ? '休んだ' : '休む'}</button>
        <button type="button" class="btn ${rested ? 'primary' : ''}" data-run="next">${run.room === dungeon.floors[run.floor].length - 1 ? `先へ進む（地下${run.floor + 2}層へ）` : '先へ進む'}</button>
        <button type="button" class="btn" data-run="retreat">退却する（持ち帰る）</button>
      </div></div>`;
  }

  const abandon = confirmAbandon
    ? `<div class="row-btns"><button type="button" class="btn danger" data-run="abandon-yes">${dungeon.rank === '底' ? `脱出する（レベルを${ABYSS.escapeLevelLoss}失う）` : '諦めて出る（何も持ち帰れない）'}</button><button type="button" class="btn" data-run="abandon-no">やめる</button></div>`
    : `<button type="button" class="btn quiet" data-run="abandon">${dungeon.rank === '底' ? '底から脱出する' : '探索を諦める'}</button>`;

  $('#runBody').innerHTML = `${head}
    ${notice ? `<p class="notice" role="status">${esc(notice)}</p>` : ''}
    ${status}
    ${action}
    <div class="preview">${mapHTML(dungeon, run)}</div>
    ${abandon}`;
}

/** 呪死でレベルを奪う敵の注意書き */
function dangerNote(e: Character): string {
  const w = loadout(e).right;
  if (!w.art?.drain) return '';
  const curse = w.curse ? '通常の攻撃でも呪死が溜まる。' : '';
  return `<p class="stain-note">${w.art.name}は${w.art.unguardable ? 'ガードできず、' : ''}回避しないと呪死が溜まり、溜まりきると即死する。${curse}これで呪死するとレベルを1失い、底を出ても戻らない。</p>`;
}

function resultHTML({ run: r, banked }: { run: RunState; banked: Banked }): string {
  const abyss = r.catacombId.startsWith('abyss:');
  const title = r.status === 'cleared' ? '踏破' : r.status === 'retreated' ? '退却' : abyss ? '脱出' : '探索を諦めた';
  const kept = r.status === 'abandoned'
    ? `<p class="note">この探索で得たソウルと拾ったものは、すべて失われました。${abyss ? `レベルを${ABYSS.escapeLevelLoss}失いました。` : ''}</p>`
    : `<ul class="gains">
        <li>ソウル <b>+${banked.souls}</b></li>
        ${banked.items.map((id) => `<li>装備「${(WEAPONS[id] ?? SHIELDS[id] ?? ARMORS[id]).name}」を手に入れた</li>`).join('')}
        ${banked.cards.map((id) => `<li>カード「${CARDS[id].name}」を手に入れた</li>`).join('')}
        ${banked.dupes.map((id) => `<li>「${(WEAPONS[id] ?? SHIELDS[id] ?? ARMORS[id]).name}」はすでに持っていたのでソウルに替えた</li>`).join('')}
        ${banked.left.map((l) => `<li class="dim">${lootName(l)}は、主を倒していない階層で拾ったので置いてきた</li>`).join('')}
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
  if (next.status === 'cleared' && next.catacombId.startsWith('abyss:')) {
    const key = next.catacombId.slice(6);
    if (!(character.abyssCleared ?? []).includes(key)) {
      character.abyssCleared = [...(character.abyssCleared ?? []), key];
      notice = [notice, `${abyssName(key)}を踏破した。これからは入口の「踏破した底」から直接入れる（シード「${abyssSeed(key)}」）。`].filter(Boolean).join(' ');
    }
  }
  if (next.status === 'cleared' || next.status === 'retreated') upsertCharacter(character);
  if (next.status === 'abandoned' && next.catacombId.startsWith('abyss:')) {
    upsertCharacter(loseLevels(c, ABYSS.escapeLevelLoss));
    notice = `底から脱出した。代償にレベルを${ABYSS.escapeLevelLoss}失った。`;
  }
  result = { run: next, banked };
  show('run');
  renderRun();
}

function step(next: RunState, msg = ''): void {
  run = next;
  notice = [msg, clueNotice].filter(Boolean).join(' ');
  clueNotice = '';
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
  let r = run;
  const stain = stainHere(r);
  const firstLoot = room.loot && !isLooted(r);
  startBattle(c, room.enemy!, (won, me) => {
    // 呪死してレベルを失ったら、すぐにキャラへ反映する（脱出しても戻らない）
    let lost = '';
    if (me.drained) {
      const now = charId ? findCharacter(charId) : undefined;
      if (now) upsertCharacter(loseLevels(now, me.drained));
      lost = `呪死により、レベルを${me.drained}失った。`;
    }
    if (won) {
      if (room.clue) foundClue(room.clue);
      const gotLoot = firstLoot ? `「${lootName(room.loot!)}」を拾った。` : '';
      const gotStain = stainHere(r) ? `血痕のソウル ${stainHere(r)!.souls} を取り戻した。` : '';
      step(winBattle(d, r, me.hp, me.fp), `${lost}${room.enemy!.name}を倒した。ソウル +${room.souls}。${gotLoot}${gotStain}`);
    } else {
      const prev = r.stain ? `前の血痕のソウル ${r.stain.souls} は失われた。` : '';
      const dropped = r.souls > 0 ? `ソウル ${r.souls} をこの部屋に落とした。` : '';
      step(loseBattle(r), `あなたは倒れた。${lost}${dropped}${prev}最初の部屋からやり直す。`);
    }
  }, {
    hp: r.hp, fp: r.fp, foeHpRatio: room.hpRatio,
    surrenderNote: '地下墓で降参すると倒れたことになります。持っているソウルはこの部屋に落ち、最初の部屋からやり直しです。',
    special: stain ? {
      label: `ソウルを回収する（${stain.souls}）`,
      note: 'この手番を使って先に取り戻す（ダイスは振らずに手番が終わる）。勝てば回収しなくても取り戻せるが、回収前に倒れると失う。',
      use: () => {
        r = retrieveStain(r);
        saveRun(r);
        return `落としたソウル ${stain.souls} を取り戻した。`;
      },
    } : undefined,
  });
}

/** 手がかりを覚える（物と違って、倒れても諦めても忘れない） */
function learnClue(c: Character, key: string): boolean {
  if ((c.clues ?? []).includes(key)) return false;
  upsertCharacter({ ...c, clues: [...(c.clues ?? []), key], updatedAt: Date.now() });
  return true;
}

function foundClue(key: string): void {
  const c = charId ? findCharacter(charId) : undefined;
  if (!c || !learnClue(c, key)) return;
  const f = FIXED_CATACOMBS[key];
  clueNotice = `手がかりを見つけた：「${f.name}」へ続くシード「${f.seed}」。地下墓の入口の「手がかり」から入れる。`;
}
let clueNotice = '';

/* ---------------- 操作 ---------------- */

export function bindCatacombs(): void {
  $('#dgBody').addEventListener('click', (ev) => {
    const t = ev.target as HTMLElement;
    const h = t.closest<HTMLElement>('[data-hist]');
    if (h) {
      seed = h.dataset.hist!;
      seedAuto = false;
      return renderSelect();
    }
    if (t.closest('[data-seed]')) {
      seed = versionedSeed(randomSeed());
      seedAuto = true;
      return renderSelect();
    }
    if (t.closest('#dgGo')) enter();
  });
  $('#dgBody').addEventListener('change', (ev) => {
    const t = ev.target as HTMLInputElement;
    if (t.id === 'dgSeed') {
      seed = t.value.slice(0, 24);
      seedAuto = false;
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
        if (room?.clue && !isLooted(run)) foundClue(room.clue);
        return step(openChest(dungeon, run),
          isLooted(run) ? '' : room?.loot ? `宝箱から「${lootName(room.loot)}」を見つけた。` : `宝箱にはソウルが残っていた。ソウル +${room?.souls ?? 0}。`);
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
        return step(abandon(run));
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
