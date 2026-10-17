import { findPayment, stageCost } from '../engine/cost';
import { chance } from '../engine/dice';
import { spend } from '../engine/fighter';
import { scaled } from '../engine/scaling';
import type { Fighter } from '../engine/types';
import type { Battle, IncomingHit, Reaction } from './battle';

/** NPCの手番: 余裕があれば1個残し、戦技→武器の連撃の順に使う */
export async function npcTurn(b: Battle, e: Fighter, p: Fighter): Promise<void> {
  b.log(`${e.name}の手番。`, 'foe');
  let reserve = e.stamina >= 4 ? 1 : 0;
  if (p.hp <= 18) reserve = 0;
  b.rollAction(e, e.stamina - reserve);
  b.update();
  await b.wait(800);

  const w = e.weapon;
  const art = w.art;
  if (e.fp >= art.fp && chance(0.7)) {
    const pay = findPayment(e.action, art.cost);
    if (pay) {
      spend(e, pay);
      e.fp -= art.fp;
      b.update();
      await b.strike(e, p, {
        label: art.name, dmg: scaled(art.dmg, e.stats), type: art.type, weapon: true, unguardable: art.unguardable,
      });
    }
  }
  while (!b.over && e.chain < w.maxChain) {
    const pay = findPayment(e.action, stageCost(w, e.chain));
    if (!pay) break;
    spend(e, pay);
    e.chain++;
    b.update();
    await b.strike(e, p, { label: `${w.name}・${e.chain}段目`, dmg: scaled(w.dmg, e.stats), type: w.type, weapon: true });
    await b.wait(300);
  }
  if (!b.over) {
    b.log(`${e.name}は様子を見ている。`);
    await b.wait(400);
  }
}

/** リアクションで振る個数（0 = 受ける） */
export function npcReactDice(def: Fighter, hit: IncomingHit): number {
  if (hit.raw <= 4) return 0;
  return Math.min(def.stamina, hit.raw >= 12 ? 3 : 2);
}

export function npcReactChoice(canDodge: boolean, canGuard: boolean): Reaction {
  return canDodge ? 'dodge' : canGuard ? 'guard' : 'take';
}
