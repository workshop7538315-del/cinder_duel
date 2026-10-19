import type { RunState } from './run';

/** 探索中の状態はキャラごとにこのブラウザに保存する（同期はしない） */
const key = (charId: string) => `cinder_duel.run.${charId}`;

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadRun(charId: string): RunState | null {
  try {
    const r = JSON.parse(storage()?.getItem(key(charId)) ?? 'null') as RunState | null;
    return r && r.charId === charId && r.status === 'active' ? r : null;
  } catch {
    return null;
  }
}

export function saveRun(run: RunState): void {
  try {
    if (run.status === 'active') storage()?.setItem(key(run.charId), JSON.stringify(run));
    else storage()?.removeItem(key(run.charId));
  } catch {
    /* 保存できなくても、このページを開いている間は続けられる */
  }
}

export function clearRun(charId: string): void {
  try {
    storage()?.removeItem(key(charId));
  } catch {
    /* noop */
  }
}
