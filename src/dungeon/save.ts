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

/* ---------------- 行ったことのあるシード ---------------- */

export interface SeedRecord {
  seed: string;
  catacombId: string;
  rooms: number;
  at: number;
}

const HISTORY_KEY = 'cinder_duel.seeds';
const HISTORY_MAX = 12;

export function loadSeedHistory(): SeedRecord[] {
  try {
    const r = JSON.parse(storage()?.getItem(HISTORY_KEY) ?? '[]') as SeedRecord[];
    return Array.isArray(r) ? r.filter((x) => x && typeof x.seed === 'string') : [];
  } catch {
    return [];
  }
}

export function rememberSeed(rec: SeedRecord): void {
  try {
    const list = [rec, ...loadSeedHistory().filter((x) => x.seed !== rec.seed)].slice(0, HISTORY_MAX);
    storage()?.setItem(HISTORY_KEY, JSON.stringify(list));
  } catch {
    /* 覚えておけなくても遊べる */
  }
}
