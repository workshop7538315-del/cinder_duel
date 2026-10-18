import { checkCharacter } from '../character/model';
import { mergeSave, parseSave, serializeSave } from '../character/storage';
import { RULES } from '../data/rules';
import { $, esc, show } from './dom';
import { openEditor } from './editor';
import { signInWithDiscord, signOut } from '../net/cloud';
import {
  characters, deleteCharacter, getAccount, getSave, onSyncChange, replaceSave, storageOk, syncNow, syncStatus,
} from './state';
import { charSummary, openVersus } from './versus';

let confirmDelete: string | null = null;

export function openHome(msg?: string): void {
  confirmDelete = null;
  show('home');
  render();
  if (msg !== undefined) dataMsg(msg);
}

function dataMsg(t: string): void {
  $('#dataMsg').textContent = t;
}

const SYNC_TEXT = {
  off: '',
  syncing: '同期中…',
  ok: '同期済み',
  error: '同期できませんでした',
} as const;

function renderAccount(): void {
  const a = getAccount();
  const st = syncStatus();
  $('#account').innerHTML = a
    ? `<div class="acc-main"><span class="acc-name">${esc(a.name)}</span>
        <span class="acc-sync sync-${st}">${SYNC_TEXT[st]}</span></div>
       <div class="row-btns">${st === 'error' ? '<button type="button" class="btn" data-acc="retry">もう一度同期</button>' : ''}
        <button type="button" class="btn" data-acc="out">ログアウト</button></div>`
    : `<div class="acc-main"><span class="acc-name dim">ログインしていません</span>
        <span class="note">ログインすると、キャラクターをどの端末からでも使えます。</span></div>
       <button type="button" class="btn discord" data-acc="in">Discordでログイン</button>`;
}

function render(): void {
  renderAccount();
  const list = characters();
  $('#charList').innerHTML = list.length
    ? list.map((c) => {
        const bad = checkCharacter(c).errors.length > 0;
        const del = confirmDelete === c.id
          ? `<button type="button" class="btn danger" data-del-yes="${c.id}">本当に削除</button><button type="button" class="btn" data-del-no>やめる</button>`
          : `<button type="button" class="btn" data-del="${c.id}">削除</button>`;
        return `<article class="char">
          <div class="char-main"><b>${esc(c.name)}</b>${bad ? '<span class="badge">要修正</span>' : ''}<span>${charSummary(c)}</span></div>
          <div class="char-btns">
            <button type="button" class="btn primary" data-fight="${c.id}" ${bad ? 'disabled' : ''}>戦う</button>
            <button type="button" class="btn" data-edit="${c.id}">編集</button>${del}
          </div></article>`;
      }).join('')
    : `<div class="empty-state"><p>まだキャラクターがいません。</p><p class="note">「新しく作る」から素性を選び、レベル${RULES.levelBudget}分の能力値を振って、装備とデッキを決めます。</p></div>`;
  if (!storageOk()) dataMsg('このブラウザでは保存できませんでした。書き出しでファイルに残してください。');
}

function exportFile(): void {
  const blob = new Blob([serializeSave(getSave())], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  a.href = url;
  a.download = `cinder_duel_${ymd}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  dataMsg(`${characters().length}人分を書き出しました。`);
}

async function importFile(file: File): Promise<void> {
  try {
    const incoming = parseSave(await file.text());
    if (!incoming.characters.length) return dataMsg('読み込めるキャラクターがありませんでした。');
    const { save, added } = mergeSave(getSave(), incoming);
    replaceSave(save);
    render();
    dataMsg(`${added}人を読み込みました。`);
  } catch (e) {
    dataMsg(e instanceof Error ? e.message : '読み込みに失敗しました。');
  }
}

export function bindHome(): void {
  onSyncChange(() => {
    if (!$('#home').hidden) render();
  });
  $('#account').addEventListener('click', async (ev) => {
    const act = (ev.target as HTMLElement).closest<HTMLElement>('[data-acc]')?.dataset.acc;
    try {
      if (act === 'in') await signInWithDiscord();
      else if (act === 'out') await signOut();
      else if (act === 'retry') await syncNow();
    } catch {
      dataMsg('ログインの処理に失敗しました。通信状況を確かめて、もう一度試してください。');
    }
  });
  $('#newChar').addEventListener('click', () => openEditor(null, () => openHome()));
  $('#charList').addEventListener('click', (ev) => {
    const t = ev.target as HTMLElement;
    const get = (k: string) => t.closest<HTMLElement>(`[data-${k}]`)?.dataset;
    const fight = get('fight')?.fight;
    if (fight) return openVersus(fight, () => openHome());
    const edit = get('edit')?.edit;
    if (edit) return openEditor(edit, () => openHome());
    const del = get('del')?.del;
    if (del) {
      confirmDelete = del;
      return render();
    }
    const yes = get('del-yes')?.delYes;
    if (yes) {
      deleteCharacter(yes);
      confirmDelete = null;
      render();
      return dataMsg('削除しました。');
    }
    if (t.closest('[data-del-no]')) {
      confirmDelete = null;
      render();
    }
  });
  $('#exportBtn').addEventListener('click', exportFile);
  $<HTMLInputElement>('#importFile').addEventListener('change', (e) => {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    if (f) void importFile(f);
    input.value = '';
  });
}
