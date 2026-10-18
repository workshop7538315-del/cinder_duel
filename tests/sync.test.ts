import { describe, expect, it } from 'vitest';
import { newCharacter, type Character } from '../src/character/model';
import { loadSynced, mergeWithRemote, saveSynced } from '../src/character/sync';

const at = (c: Character, t: number): Character => ({ ...c, updatedAt: t });
const ids = (l: Character[]) => l.map((c) => c.id);

describe('端末とアカウントのキャラを合わせる', () => {
  const a = newCharacter('vagabond');
  const b = newCharacter('bandit');
  const c = newCharacter('prophet');

  it('初めてのログイン: 端末のキャラは全部送り、アカウントのキャラは端末に加える', () => {
    const r = mergeWithRemote([a], [b], new Set());
    expect(ids(r.merged)).toEqual([a.id, b.id]);
    expect(ids(r.upload)).toEqual([a.id]);
  });
  it('両方にあれば更新日時が新しい方', () => {
    const local = at({ ...a, name: '端末' }, 200);
    const remote = at({ ...a, name: 'アカウント' }, 100);
    expect(mergeWithRemote([local], [remote], new Set([a.id])).merged[0].name).toBe('端末');
    expect(mergeWithRemote([local], [remote], new Set([a.id])).upload).toHaveLength(1);
    expect(mergeWithRemote([at(local, 50)], [remote], new Set([a.id])).merged[0].name).toBe('アカウント');
  });
  it('同期済みなのにアカウントにないキャラは、他の端末で削除されたとみなす', () => {
    const r = mergeWithRemote([a, c], [], new Set([a.id]));
    expect(ids(r.removed)).toEqual([a.id]);
    expect(ids(r.merged)).toEqual([c.id]);
    expect(ids(r.upload)).toEqual([c.id]);
  });
});

describe('同期済みの記録', () => {
  class Mem { m = new Map<string, string>(); getItem(k: string) { return this.m.get(k) ?? null; } setItem(k: string, v: string) { this.m.set(k, v); } removeItem(k: string) { this.m.delete(k); } }
  it('アカウントごとに分ける', () => {
    const st = new Mem() as unknown as Storage;
    saveSynced('u1', ['x', 'y'], st);
    expect([...loadSynced('u1', st)]).toEqual(['x', 'y']);
    expect(loadSynced('u2', st).size).toBe(0);
    saveSynced(null, [], st);
    expect(loadSynced('u1', st).size).toBe(0);
  });
});
