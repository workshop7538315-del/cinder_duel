import { describe, expect, it } from 'vitest';
import { newCharacter } from '../src/character/model';
import {
  SAVE_VERSION, emptySave, loadSave, mergeSave, parseSave, serializeSave, writeSave,
} from '../src/character/storage';

class MemStorage {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
}

describe('セーブデータ', () => {
  it('書き出したものを読み込むと同じキャラに戻る', () => {
    const c = newCharacter('samurai', '刀の人');
    c.alloc.dex = 7;
    const text = serializeSave({ version: SAVE_VERSION, characters: [c] });
    expect(parseSave(text).characters[0]).toEqual(c);
  });
  it('ブラウザの保存領域に書いて読める', () => {
    const st = new MemStorage() as unknown as Storage;
    const c = newCharacter('hero');
    expect(writeSave({ version: SAVE_VERSION, characters: [c] }, st)).toBe(true);
    expect(loadSave(st).characters[0].id).toBe(c.id);
    expect(loadSave(new MemStorage() as unknown as Storage)).toEqual(emptySave());
  });
  it('壊れた中身や知らない装備・カードは取り除く', () => {
    const text = JSON.stringify({
      version: 1,
      characters: [
        { classId: 'nope' },
        { classId: 'bandit', name: '', alloc: { dex: '3', vit: -2 }, equip: { right: 'laser', left: 'dagger', head: 'iron_armor' }, deck: ['kick', 'fake'] },
      ],
    });
    const [c] = parseSave(text).characters;
    expect(c.name).toBe('盗賊');
    expect(c.alloc.dex).toBe(3);
    expect(c.alloc.vit).toBe(0);
    expect(c.equip).toEqual({ right: null, left: null, head: null, chest: null, arms: null, legs: null });
    expect(c.deck).toEqual(['kick']);
  });
  it('振り分けの上限を超えたデータは振り直しにする', () => {
    const [c] = parseSave(JSON.stringify({ version: 1, characters: [{ classId: 'wretch', alloc: { vit: 99 } }] })).characters;
    expect(c.alloc.vit).toBe(0);
  });
  it('新しいバージョンのデータは読まない', () => {
    expect(() => parseSave(JSON.stringify({ version: SAVE_VERSION + 1, characters: [] }))).toThrow();
  });
  it('JSONでないファイルはわかるメッセージで失敗する', () => {
    expect(() => parseSave('hello')).toThrow(/読み取れません/);
  });
  it('同じIDのキャラは別人として追加する', () => {
    const c = newCharacter('prisoner');
    const { save, added } = mergeSave({ version: 1, characters: [c] }, { version: 1, characters: [c] });
    expect(added).toBe(1);
    expect(save.characters).toHaveLength(2);
    expect(save.characters[1].id).not.toBe(c.id);
  });
});
