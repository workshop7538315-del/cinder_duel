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

/** 主の第二形態を書いていなければ、自動で足す（攻撃が強まり、溜めの大技が加わる） */
export function withAutoPhase2(b: Behavior): Behavior {
  if (b.phase2) return b;
  return {
    ...b,
    phase2: {
      at: AUTO_BEHAVIOR.phase2At, mode: 'random',
      moves: [
        ...b.moves.map((m) => (m.use ? { ...m, mult: (m.mult ?? 1) * AUTO_BEHAVIOR.phase2Mult, weight: m.weight ?? 1 } : m)),
        { name: '渾身の一撃', use: 'weapon', mult: AUTO_BEHAVIOR.chargeMult, charge: true, unguardable: true,
          dodgeExtra: AUTO_BEHAVIOR.chargeDodgeExtra, weight: AUTO_BEHAVIOR.chargeWeight },
      ],
    },
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
export function nextMoveName(f: Fighter): string | null {
  if (!f.pattern) return null;
  const m = f.pattern.behavior.moves[f.pattern.next];
  if (!m) return null;
  return f.pattern.charging ? `${m.name}（溜め中・次の手番に放つ）` : m.charge ? `${m.name}の構え` : m.name;
}

/** 主: HPが減ったら第二形態に入る（行動表が変わり、体幹が戻る） */
export function enterPhase2IfNeeded(b: Battle, e: Fighter): void {
  const st = e.pattern!;
  const p2 = st.behavior.phase2;
  if (!p2 || st.phased || e.hp > e.maxHp * p2.at) return;
  st.phased = true;
  st.charging = false;
  st.guarding = false;
  st.behavior = { ...st.behavior, mode: p2.mode ?? st.behavior.mode, moves: p2.moves, aura: p2.aura ?? st.behavior.aura, phase2: undefined };
  st.next = firstMove(st.behavior);
  e.poise = e.maxPoise;
  b.log(p2.text ?? `${e.name}の様子が変わった……！`, 'round');
}

/** 強敵・主の手番。予告していた行動をして、次の行動を決める */
export async function patternTurn(b: Battle, e: Fighter, p: Fighter): Promise<void> {
  const st = e.pattern!;
  const m = st.behavior.moves[st.next];
  st.guarding = false;
  // 溜める大技は、まず構えるだけ（予告）。次の手番に放つ
  if (m.charge && !st.charging) {
    st.charging = true;
    b.log(`${e.name}は「${m.name}」の構えに入った！ 次の手番に放ってくる。`, 'foe');
    b.update();
    await b.wait(700);
    return;
  }
  st.charging = false;
  b.log(`${e.name}の手番。「${m.name}」`, 'foe');
  b.update();
  await b.wait(700);
  if (m.heal) b.heal(e, Math.round(e.maxHp * m.heal));
  if (m.guard) {
    st.guarding = true;
    b.log(`${e.name}は守りを固めた（次の手番までガードする）。`, 'foe');
  }
  if (m.card && CARDS[m.card]) await CARDS[m.card].run(b, e, p, { discarded: m.discarded ?? 0 });
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
        dodgeExtra: m.dodgeExtra,
        poiseMult: m.poiseMult,
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
