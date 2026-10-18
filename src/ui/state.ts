import type { Character } from '../character/model';
import { loadSave, writeSave, type SaveData } from '../character/storage';

/** 画面全体で共有するセーブデータ */
let save: SaveData = loadSave();
let lastWriteOk = true;

export const getSave = (): SaveData => save;
export const characters = (): Character[] => save.characters;
export const findCharacter = (id: string): Character | undefined => save.characters.find((c) => c.id === id);
export const storageOk = (): boolean => lastWriteOk;

export function replaceSave(next: SaveData): void {
  save = next;
  lastWriteOk = writeSave(save);
}

export function upsertCharacter(c: Character): void {
  const list = save.characters.filter((x) => x.id !== c.id);
  const i = save.characters.findIndex((x) => x.id === c.id);
  if (i >= 0) list.splice(i, 0, c);
  else list.push(c);
  replaceSave({ ...save, characters: list });
}

export function deleteCharacter(id: string): void {
  replaceSave({ ...save, characters: save.characters.filter((c) => c.id !== id) });
}
