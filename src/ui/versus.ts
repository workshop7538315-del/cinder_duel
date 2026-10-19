import { charLevel, checkCharacter, loadout, type Character } from '../character/model';
import { CLASSES } from '../data/classes';
import { RULES } from '../data/rules';
import { ownInBand, pickPreset, type OpponentMode } from '../game/matchmaking';
import { startBattle } from './battle';
import { $, esc, show } from './dom';
import { characters, findCharacter } from './state';

let playerId: string | null = null;
let mode: OpponentMode = 'preset';
let ownPick: string | null = null;
let onBack: () => void = () => {};

export function charSummary(c: Character): string {
  const lo = loadout(c);
  const gear = [lo.right.name, lo.left?.name].filter(Boolean).join('＋');
  return `${CLASSES[c.classId].name}・Lv${lo.level}・${lo.weightClass.name}・${gear}`;
}

export function openVersus(id: string, back: () => void): void {
  playerId = id;
  onBack = back;
  ownPick = null;
  show('versus');
  render();
}

function render(): void {
  const me = playerId ? findCharacter(playerId) : undefined;
  if (!me) return onBack();
  const lv = charLevel(me);
  const lo = Math.max(1, lv - RULES.levelBand);
  const hi = lv + RULES.levelBand;
  const own = ownInBand(characters(), lv).filter((c) => !checkCharacter(c).errors.length);
  if (ownPick && !own.some((c) => c.id === ownPick)) ownPick = null;

  const modeBtn = (m: OpponentMode, title: string, desc: string) => `
    <button type="button" class="mode ${mode === m ? 'on' : ''}" data-mode="${m}" aria-pressed="${mode === m}">
      <b>${title}</b><span>${desc}</span></button>`;

  const ownList = mode === 'own'
    ? own.length
      ? `<div class="own-list">${own.map((c) => `
          <button type="button" class="own ${ownPick === c.id ? 'on' : ''}" data-own="${c.id}">
            <b>${esc(c.name)}</b><span>${charSummary(c)}</span></button>`).join('')}</div>`
      : `<p class="note">Lv${lo}〜${hi}の自分のキャラがいません。</p>`
    : '';

  const ready = mode !== 'own' || !!ownPick;
  $('#vsBody').innerHTML = `
    <div class="vs-me"><p class="eyebrow">あなた</p><b>${esc(me.name)}</b><span>${charSummary(me)}</span></div>
    <p class="eyebrow">対戦相手</p>
    <p class="note">相手はレベル差${RULES.levelBand}以内（Lv${lo}〜${hi}）から選ばれます。いなければ一番近いレベルの相手になります。</p>
    <div class="modes">
      ${modeBtn('preset', 'ランダム', '用意された相手から')}
      ${modeBtn('strong', '強敵', '手強い相手から')}
      ${modeBtn('own', '自分のキャラ', '保存したキャラと戦う')}
    </div>
    ${ownList}
    <button type="button" class="btn primary big" id="vsGo" ${ready ? '' : 'disabled'}>戦う</button>`;
}

function go(): void {
  const me = playerId ? findCharacter(playerId) : undefined;
  if (!me) return;
  let foe: Character | null | undefined;
  if (mode === 'own') foe = ownPick ? findCharacter(ownPick) : null;
  else foe = pickPreset(charLevel(me), mode === 'strong');
  if (!foe) return;
  startBattle(me, foe, () => openVersus(me.id, onBack), { surrenderNote: '練習試合なので、失うものはありません。' });
}

export function bindVersus(): void {
  $('#vsBody').addEventListener('click', (ev) => {
    const t = ev.target as HTMLElement;
    const m = t.closest<HTMLElement>('[data-mode]');
    if (m) {
      mode = m.dataset.mode as OpponentMode;
      return render();
    }
    const o = t.closest<HTMLElement>('[data-own]');
    if (o) {
      ownPick = o.dataset.own!;
      return render();
    }
    if (t.closest('#vsGo')) go();
  });
  $('#vsBack').addEventListener('click', () => onBack());
}
