import { CARDS } from '../data/cards';
import { findPayment, stageCost } from '../engine/cost';
import { chance } from '../engine/dice';
import { spend } from '../engine/fighter';
import type { Die, Fighter } from '../engine/types';
import { cardUnusable, type Battle, type IncomingHit, type Reaction } from './battle';

/** ラウンド開始時にカードを引くか */
export const npcDraws = (e: Fighter): boolean => e.stamina >= 4 && e.hand.length < 4;

/** 役割が合うカードを1枚使う。使えたら true */
async function tryCard(b: Battle, e: Fighter, p: Fighter, roles: string[]): Promise<boolean> {
  for (let i = 0; i < e.hand.length; i++) {
    const c = CARDS[e.hand[i]];
    if (!c || !roles.includes(c.role) || cardUnusable(e, e.hand[i])) continue;
    const pay = findPayment(e.action, c.cost);
    if (!pay) continue;
    spend(e, pay);
    await b.playCard(e, p, i, pay);
    return true;
  }
  return false;
}

/** NPCの手番: 回復 → 強化 → 戦技 → 武器の連撃 → 余ったダイスで攻撃カード */
export async function npcTurn(b: Battle, e: Fighter, p: Fighter): Promise<void> {
  b.log(`${e.name}の手番。`, 'foe');
  let reserve = e.stamina >= 4 ? 1 : 0;
  if (p.hp <= p.maxHp * 0.25) reserve = 0;
  b.rollAction(e, e.stamina - reserve);
  b.update();
  await b.wait(800);

  if (e.hp < e.maxHp * 0.5) await tryCard(b, e, p, ['heal']);
  if (!b.over && e.action.length >= 3 && chance(0.5)) await tryCard(b, e, p, ['buff']);

  const art = e.right.art;
  if (!b.over && art && !art.reaction && e.fp >= art.fp && chance(0.7)) {
    const pay = findPayment(e.action, art.cost);
    if (pay) {
      spend(e, pay);
      b.update();
      await b.weaponArt(e, p);
    }
  }
  while (!b.over && e.chain < e.right.maxChain) {
    const pay = findPayment(e.action, stageCost(e.right, e.chain));
    if (!pay) break;
    spend(e, pay);
    b.update();
    await b.weaponAttack(e, p);
    await b.wait(300);
  }
  while (!b.over && e.action.length && (await tryCard(b, e, p, ['attack']))) await b.wait(300);
  if (!b.over) {
    b.log(`${e.name}は様子を見ている。`);
    await b.wait(400);
  }
}

/** 捨てるカードを選ぶ（捨てて発動するカードを優先し、あとは使いにくいものから） */
export function npcDiscards(hand: string[], min: number, max: number): number[] {
  const score = (id: string) => (CARDS[id]?.onDiscard ? 0 : CARDS[id]?.unplayable ? 1 : CARDS[id]?.role === 'utility' ? 2 : 3);
  const order = hand.map((id, i) => [i, score(id)] as const).sort((a, b) => a[1] - b[1]);
  const triggers = order.filter(([i]) => CARDS[hand[i]]?.onDiscard).length;
  return order.slice(0, Math.max(min, Math.min(max, triggers))).map(([i]) => i);
}

/** リアクションで振る個数（0 = 受ける） */
export function npcReactDice(def: Fighter, hit: IncomingHit, pool: Die[] = []): number {
  if (hit.raw <= 4) return pool.length ? -1 : 0;
  // ためてある出目で回避かガードができるなら、追加で振らない
  const canNow = (hit.dodgeCost !== null && findPayment(pool, { t: 'sum', n: hit.dodgeCost }))
    || (!hit.attack.unguardable && findPayment(pool, { t: 'sum', n: hit.guardCost }));
  if (canNow) return 0;
  // スタミナが少ないときは、命に関わる攻撃でなければ受けて、自分の手番のために残す
  const dangerous = hit.raw >= def.hp || hit.raw >= def.maxHp * 0.2;
  if (!dangerous && def.stamina <= 3) return 0;
  return Math.min(def.stamina, hit.raw >= 12 ? 3 : 2);
}

export function npcReactChoice(canDodge: boolean, canGuard: boolean, canArt = false): Reaction {
  return canArt ? 'art' : canDodge ? 'dodge' : canGuard ? 'guard' : 'take';
}
