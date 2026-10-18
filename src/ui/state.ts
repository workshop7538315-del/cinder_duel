import type { Character } from '../character/model';
import { loadSave, writeSave, type SaveData } from '../character/storage';
import { loadSynced, mergeWithRemote, saveSynced } from '../character/sync';
import { deleteRemoteCharacter, fetchCharacters, uploadCharacters, type Account } from '../net/cloud';

/* ---------------- セーブデータ（端末内が作業用の正本） ---------------- */

let save: SaveData = loadSave();
let lastWriteOk = true;

export const getSave = (): SaveData => save;
export const characters = (): Character[] => save.characters;
export const findCharacter = (id: string): Character | undefined => save.characters.find((c) => c.id === id);
export const storageOk = (): boolean => lastWriteOk;

function writeLocal(next: SaveData): void {
  save = next;
  lastWriteOk = writeSave(save);
}

/** 読み込みなどでまとめて入れ替える（ログイン中ならサーバーにも送る） */
export function replaceSave(next: SaveData): void {
  writeLocal(next);
  void syncNow();
}

export function upsertCharacter(c: Character): void {
  const list = [...save.characters];
  const i = list.findIndex((x) => x.id === c.id);
  if (i >= 0) list[i] = c;
  else list.push(c);
  writeLocal({ ...save, characters: list });
  if (account) void push(() => uploadCharacters(account!.id, [c]), c.id);
}

export function deleteCharacter(id: string): void {
  writeLocal({ ...save, characters: save.characters.filter((c) => c.id !== id) });
  if (account) void push(() => deleteRemoteCharacter(id), null, id);
}

/* ---------------- アカウントと同期 ---------------- */

export type SyncStatus = 'off' | 'syncing' | 'ok' | 'error';

let account: Account | null = null;
let status: SyncStatus = 'off';
let syncing: Promise<void> | null = null;
const listeners = new Set<() => void>();

export const getAccount = (): Account | null => account;
export const syncStatus = (): SyncStatus => status;
export function onSyncChange(fn: () => void): void {
  listeners.add(fn);
}
function setStatus(s: SyncStatus): void {
  status = s;
  listeners.forEach((fn) => fn());
}

/** サーバーのキャラと端末のキャラを合わせる */
export function syncNow(): Promise<void> {
  if (!account) return Promise.resolve();
  if (syncing) return syncing;
  const owner = account.id;
  setStatus('syncing');
  syncing = (async () => {
    try {
      const remote = await fetchCharacters();
      const synced = loadSynced(owner);
      // 同期中に端末で変更があっても失わないよう、最新の端末データで合わせる
      const { merged, upload } = mergeWithRemote(save.characters, remote, synced);
      await uploadCharacters(owner, upload);
      if (account?.id !== owner) return;
      writeLocal({ ...save, characters: merged });
      saveSynced(owner, merged.map((c) => c.id));
      setStatus('ok');
    } catch {
      if (account?.id === owner) setStatus('error');
    } finally {
      syncing = null;
    }
  })();
  return syncing;
}

/** 1件の変更をサーバーに送る。失敗したら次の同期でまとめて直す */
async function push(op: () => Promise<void>, addedId: string | null, removedId?: string): Promise<void> {
  const owner = account?.id;
  if (!owner) return;
  try {
    await op();
    const ids = loadSynced(owner);
    if (addedId) ids.add(addedId);
    if (removedId) ids.delete(removedId);
    saveSynced(owner, ids);
    if (status !== 'syncing') setStatus('ok');
  } catch {
    setStatus('error');
  }
}

/** ログイン状態が変わったとき */
export async function setAccount(next: Account | null): Promise<void> {
  const prev = account;
  if (prev?.id === next?.id) return;
  account = next;
  if (next) {
    await syncNow();
    return;
  }
  // ログアウト: そのアカウントに同期済みのキャラは端末から外す（サーバーには残っている）
  if (prev) {
    const synced = loadSynced(prev.id);
    writeLocal({ ...save, characters: save.characters.filter((c) => !synced.has(c.id)) });
    saveSynced(null, []);
  }
  setStatus('off');
}
