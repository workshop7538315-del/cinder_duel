import type { Character } from './model';

export interface MergeResult {
  /** 端末に残すキャラ */
  merged: Character[];
  /** サーバーに送る必要があるキャラ（端末の方が新しい、またはまだ送っていない） */
  upload: Character[];
  /** 他の端末で削除されたので、この端末からも消したキャラ */
  removed: Character[];
}

/**
 * 端末のキャラとサーバーのキャラを合わせる。
 * - 両方にある: 更新日時が新しい方を使う
 * - 端末だけにあり、前に同期したことがある: 他の端末で削除されたとみなして消す
 * - 端末だけにあり、まだ同期していない: 新しく作ったキャラなので送る
 * - サーバーだけにある: 端末に追加する
 */
export function mergeWithRemote(local: Character[], remote: Character[], syncedIds: ReadonlySet<string>): MergeResult {
  const remoteById = new Map(remote.map((c) => [c.id, c]));
  const merged: Character[] = [];
  const upload: Character[] = [];
  const removed: Character[] = [];
  for (const l of local) {
    const r = remoteById.get(l.id);
    if (r) {
      remoteById.delete(l.id);
      if (l.updatedAt > r.updatedAt) {
        merged.push(l);
        upload.push(l);
      } else merged.push(r);
    } else if (syncedIds.has(l.id)) {
      removed.push(l);
    } else {
      merged.push(l);
      upload.push(l);
    }
  }
  const extra = [...remoteById.values()].sort((a, b) => a.createdAt - b.createdAt);
  return { merged: [...merged, ...extra], upload, removed };
}

/* ---------------- どのキャラを同期済みか（アカウントごと） ---------------- */

const SYNC_KEY = 'cinder_duel.sync';

interface SyncMeta {
  owner: string;
  ids: string[];
}

export function loadSynced(owner: string, storage: Storage | null = safeStorage()): Set<string> {
  try {
    const m = JSON.parse(storage?.getItem(SYNC_KEY) ?? 'null') as SyncMeta | null;
    return new Set(m && m.owner === owner && Array.isArray(m.ids) ? m.ids : []);
  } catch {
    return new Set();
  }
}

export function saveSynced(owner: string | null, ids: Iterable<string>, storage: Storage | null = safeStorage()): void {
  try {
    if (!owner) storage?.removeItem(SYNC_KEY);
    else storage?.setItem(SYNC_KEY, JSON.stringify({ owner, ids: [...ids] } satisfies SyncMeta));
  } catch {
    /* 保存できなくても次回の同期で全部送り直すだけ */
  }
}

function safeStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
