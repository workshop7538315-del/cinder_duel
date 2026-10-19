import { AUTO_BEHAVIOR } from '../data/behaviors';
import { CARDS } from '../data/cards';
import { chance } from '../engine/dice';
import { weaponBleed, weaponDamage } from '../engine/fighter';
import type { Behavior, Fighter, PatternMove } from '../engine/types';
import type { Loadout } from '../character/model';
import type { Battle, IncomingHit, Reaction } from './battle';

/** 武器と装備から、強敵・主の動き方を作る */
export function autoBehavior(lo: Pick<Loadout, 'right' | 'left' | 'weightClass'>, deck: string[] = []): Behavior {
  const w = lo.right;
  const moves: PatternMove[] = [
    { name: w.maxChain > 1 ? `${w.maxChain}連撃` : '斬りかかる', use: 'weapon', hits: w.maxChain, weight: 3 },
    { name: '強打', use: 'weapon', mult: AUTO_BEHAVIOR.heavyMult, weight: 2 },
    { name: '様子をうかがう', weight: 1 },
  ];
  if (w.art && !w.art.reaction) moves.push({ name: w.art.name, use: 'art', weight: 2 });
  // デッキの攻撃カード（魔術・祈祷・投げナイフなど）も、行動のひとつとして使う
  const attacks = [...new Set(deck)].filter((id) => CARDS[id]?.role === 'attack' && !CARDS[id].discard && !CARDS[id].unplayable)
    .slice(0, AUTO_BEHAVIOR.cardMoves);
  for (const id of attacks) moves.push({ name: CARDS[id].name, card: id, weight: AUTO_BEHAVIOR.cardWeight });
  return {
    mode: 'random', moves,
    dodge: AUTO_BEHAVIOR.dodge[lo.weightClass.key],
    guard: lo.left?.kind === 'shield' ? AUTO_BEHAVIOR.guardWithShield : AUTO_BEHAVIOR.guardWithout,
  };
}

/** 次の行動を決める（cycle は順番、random は重み） */
export function pickNext(b: Behavior, current: number): number {
  if (b.mode === 'cycle') return (current + 1) % b.moves.length;
  const total = b.moves.reduce((a, m) => a + (m.weight ?? 1), 0);
  let x = Math.random() * total;
  for (let i = 0; i < b.moves.length; i++) if ((x -= b.moves[i].weight ?? 1) < 0) return i;
  return b.moves.length - 1;
}

/** 最初の行動 */
export const firstMove = (b: Behavior): number => (b.mode === 'cycle' ? 0 : pickNext(b, -1));

/** 予告する次の行動の名前 */
export const nextMoveName = (f: Fighter): string | null => (f.pattern ? f.pattern.behavior.moves[f.pattern.next]?.name ?? null : null);

/** 強敵・主の手番。予告していた行動をして、次の行動を決める */
export async function patternTurn(b: Battle, e: Fighter, p: Fighter): Promise<void> {
  const st = e.pattern!;
  const m = st.behavior.moves[st.next];
  st.guarding = false;
  b.log(`${e.name}の手番。「${m.name}」`, 'foe');
  b.update();
  await b.wait(700);
  if (m.heal) b.heal(e, Math.round(e.maxHp * m.heal));
  if (m.guard) {
    st.guarding = true;
    b.log(`${e.name}は守りを固めた（次の手番までガードする）。`, 'foe');
  }
  if (m.card && CARDS[m.card]) await CARDS[m.card].run(b, e, p, { discarded: 0 });
  if (m.use) {
    const src = m.use === 'art' ? e.right.art ?? null : null;
    const dmg = src ? src.dmg : e.right.dmg;
    for (let i = 0; i < (m.hits ?? 1) && !b.over; i++) {
      await b.strike(e, p, {
        label: (m.hits ?? 1) > 1 ? `${m.name}・${i + 1}撃目` : m.name,
        dmg: Math.round(weaponDamage(e, dmg) * (m.mult ?? 1)),
        type: src ? src.type : e.right.type,
        weapon: true,
        unguardable: m.unguardable || src?.unguardable,
        bleed: weaponBleed(e, src ? src.bleed : e.right.bleed),
        curse: src ? src.curse : e.right.curse,
        drain: src?.drain,
      });
      await b.wait(250);
    }
  }
  if (!m.use && !m.heal && !m.guard && !m.card) b.log(`${e.name}は様子をうかがっている。`);
  st.next = pickNext(st.behavior, st.next);
  b.update();
}

/** 強敵・主のリアクション。スタミナは使わず、その敵の確率で回避・ガードする */
export function patternReact(def: Fighter, hit: IncomingHit): Reaction {
  const st = def.pattern!;
  const canGuard = !hit.attack.unguardable;
  if (st.guarding && canGuard) return 'guard';
  if (hit.dodgeCost !== null && chance(st.behavior.dodge)) return 'dodge';
  if (canGuard && chance(st.behavior.guard)) return 'guard';
  return 'take';
}
