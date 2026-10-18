import { autoAlloc, autoDeck, charLevel, loadout, type Character } from '../character/model';
import { PRESETS, type PresetDef } from '../data/presets';
import { RULES } from '../data/rules';
import { chance } from '../engine/dice';

export type OpponentMode = 'preset' | 'strong' | 'own';

export function presetCharacter(id: string, p: PresetDef = PRESETS[id]): Character {
  const c: Character = {
    id: `preset:${id}`, name: p.name, classId: p.classId,
    alloc: autoAlloc(p.classId, p.level, p.focus),
    equip: { ...p.equip }, deck: [], createdAt: 0, updatedAt: 0,
  };
  const lo = loadout(c);
  c.deck = p.deck ? [...p.deck] : autoDeck(lo.stats, lo.schools, lo.right);
  return c;
}

export const inBand = (a: number, b: number): boolean => Math.abs(a - b) <= RULES.levelBand;

/** レベル帯の中からランダム。いなければ一番近いレベルの相手。 */
function pickNear<T>(list: T[], level: (x: T) => number, target: number): T | null {
  if (!list.length) return null;
  const band = list.filter((x) => inBand(level(x), target));
  if (band.length) {
    let pick = band[0];
    band.forEach((x, i) => {
      if (chance(1 / (i + 1))) pick = x;
    });
    return pick;
  }
  return list.reduce((a, b) => (Math.abs(level(a) - target) <= Math.abs(level(b) - target) ? a : b));
}

export function pickPreset(playerLevel: number, strong: boolean): Character | null {
  const ids = Object.keys(PRESETS).filter((id) => !!PRESETS[id].strong === strong);
  const id = pickNear(ids, (x) => PRESETS[x].level, playerLevel);
  return id ? presetCharacter(id) : null;
}

/** 自分のキャラのうち、レベル帯に入るもの */
export const ownInBand = (chars: Character[], playerLevel: number): Character[] =>
  chars.filter((c) => inBand(charLevel(c), playerLevel));
