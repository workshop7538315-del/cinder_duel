import {
  allocTotal, autoDeck, charStats, buyLevel, canBuyLevel, charLevel, levelBudget, cardBlock, checkCharacter, countCards, loadout, newCharacter,
  type Character, type EquipSlot,
} from '../character/model';
import { CARDS } from '../data/cards';
import { CLASSES, STAT_NAMES, STAT_ORDER } from '../data/classes';
import { ACCESSORIES, accessoryText } from '../data/accessories';
import { crystalText } from '../data/crystals';
import { dodgeBand } from '../engine/fighter';
import { ARMORS, ARMOR_SLOTS, SHIELDS, WEAPONS } from '../data/equipment';
import { RULES } from '../data/rules';
import { costLabel, kg, pct, reqLabel, typeName } from '../engine/format';
import { levelCost, meetsReq } from '../engine/stats';
import { scaleLabel, scaled } from '../engine/scaling';
import type { HandItem, StatKey, Stats } from '../engine/types';
import { $, esc, show } from './dom';
import { findCharacter, upsertCharacter } from './state';

interface Draft {
  c: Character;
  isNew: boolean;
  /** 保存済みのキャラは、振った能力値をこれより下げられない */
  minAlloc: Stats | null;
  /** この編集でソウルを払って上げた能力値（下げると払い戻す） */
  bought: StatKey[];
}
let D: Draft | null = null;
let onDone: () => void = () => {};

const clone = (c: Character): Character => JSON.parse(JSON.stringify(c)) as Character;

export function openEditor(id: string | null, done: () => void): void {
  onDone = done;
  const existing = id ? findCharacter(id) : undefined;
  D = existing
    ? { c: clone(existing), isNew: false, minAlloc: { ...existing.alloc }, bought: [] }
    : { c: newCharacter('vagabond'), isNew: true, minAlloc: null, bought: [] };
  $('#edTitle').textContent = D.isNew ? 'キャラクターを作る' : 'キャラクターを編集';
  $<HTMLInputElement>('#edName').value = D.c.name;
  show('editor');
  render();
}

/* ---------------- 表示 ---------------- */

function handDetail(item: HandItem | null, stats: Stats): string {
  if (!item) return '<span class="dim">なし</span>';
  const ok = meetsReq(item.req, stats);
  const parts: string[] = [`重さ ${kg(item.weight)}`, `必要 ${reqLabel(item.req)}`];
  if (item.kind !== 'shield') {
    parts.push(`${typeName(item.type)}${scaled(item.dmg, stats)}（${scaleLabel(item.dmg)}）`, `[${item.first}]+[${item.inc}]×${item.maxChain}段`);
    if (item.bleed) parts.push(`出血${scaled(item.bleed, stats)}（${scaleLabel(item.bleed)}）`);
    if (item.art) {
      const r = item.art.reaction;
      parts.push(`戦技「${item.art.name}」${costLabel(item.art.cost, item.art.fp)}${item.art.bleed ? '・出血あり' : ''}${r ? `（回避として使い、反撃${costLabel(r.counterCost)}）` : ''}`);
    }
    if (item.noEnchant) parts.push('エンチャント不可');
    if (item.school && item.power) parts.push(`${item.school === 'sorcery' ? '魔術' : '祈祷'}の触媒${item.kind === 'weapon' ? 'を兼ねる' : ''}（${scaleLabel(item.power)}）`);
  }
  parts.push(`受け 物理${pct(item.cut.phys)}・魔力${pct(item.cut.magic)}・聖${pct(item.cut.holy)}`);
  if (item.kind === 'shield' && item.guardBonus) parts.push(`ガード消費-${item.guardBonus}`);
  return `${parts.join('　')}${ok ? '' : '<b class="warn">　能力不足</b>'}`;
}

function options(list: [string, string][], value: string | null, none: string): string {
  const opts = [`<option value="">${none}</option>`, ...list.map(([id, label]) => `<option value="${id}">${label}</option>`)];
  return opts.join('').replace(`value="${value ?? ''}"`, `value="${value ?? ''}" selected`);
}

function render(): void {
  if (!D) return;
  const { c, isNew, minAlloc } = D;
  const lo = loadout(c);
  const cls = CLASSES[c.classId];
  const used = allocTotal(c.alloc);
  const budget = levelBudget(c);
  const left = budget - used;
  const issues = checkCharacter(c, { minAlloc: minAlloc ?? undefined });

  // 素性（新規のみ）
  const classPick = isNew
    ? `<section class="ed-sec"><h2 class="ed-h">素性</h2>
        <div class="cls-grid">${Object.entries(CLASSES).map(([id, k]) => `
          <button type="button" class="cls-pick ${id === c.classId ? 'on' : ''}" data-class="${id}">
            <b>${k.name}</b><small>Lv${k.level}</small></button>`).join('')}</div>
        <p class="note">素性を変えると、能力値の振り分け・装備・デッキが初期状態に戻ります。</p></section>`
    : `<p class="note">素性：${cls.name}（作成後は変えられません）</p>`;

  // 能力値
  const extra: Partial<Record<StatKey, string>> = {
    vit: `HP ${lo.derived.maxHp}`,
    att: `FP ${lo.derived.maxFp}`,
    end: `スタミナ ${lo.derived.stInit}／${lo.derived.stMax}・重量 ${kg(lo.equipLoad)}`,
  };
  const baseStats = charStats(c);
  const statRows = STAT_ORDER.map((k) => {
    const min = minAlloc?.[k] ?? 0;
    const canDown = c.alloc[k] > min;
    const canUp = (left > 0 || canBuyLevel(c)) && baseStats[k] < RULES.statMax;
    return `<div class="st-row">
      <span class="st-name">${STAT_NAMES[k]}</span>
      <span class="st-val">${lo.stats[k]}${lo.stats[k] !== baseStats[k] ? `<small class="acc-up" title="アクセサリで+${lo.stats[k] - baseStats[k]}">*</small>` : ''}</span>
      <span class="st-add">${c.alloc[k] ? `+${c.alloc[k]}` : ''}</span>
      <span class="st-btns">
        <button type="button" data-stat="${k}" data-d="-1" aria-label="${STAT_NAMES[k]}を下げる" ${canDown ? '' : 'disabled'}>−</button>
        <button type="button" data-stat="${k}" data-d="1" aria-label="${STAT_NAMES[k]}を上げる" ${canUp ? '' : 'disabled'}>＋</button>
      </span>
      <span class="st-extra">${extra[k] ?? ''}</span></div>`;
  }).join('');

  // 装備
  const stats = lo.stats;
  // 持っている装備だけを選べる
  const own = (id: string) => c.inventory.items.includes(id);
  const weaponList = Object.entries(WEAPONS).filter(([id]) => own(id)).map(([id, w]) => [id, `${w.name}（${kg(w.weight)}）${meetsReq(w.req, stats) ? '' : ' ※能力不足'}`] as [string, string]);
  const leftList: [string, string][] = [
    ...Object.entries(SHIELDS).filter(([id]) => own(id)).map(([id, s]) => [id, `${s.name}（${kg(s.weight)}）${meetsReq(s.req, stats) ? '' : ' ※能力不足'}`] as [string, string]),
    ...Object.entries(WEAPONS).filter(([id, w]) => (w.kind === 'catalyst' || w.school) && own(id))
      .map(([id, w]) => [id, `${w.name}（${kg(w.weight)}）${meetsReq(w.req, stats) ? '' : ' ※能力不足'}`] as [string, string]),
  ];
  const slotRow = (slot: EquipSlot, label: string, list: [string, string][], none: string, detail: string) => `
    <div class="eq-row"><label for="eq-${slot}">${label}</label>
      <select id="eq-${slot}" data-slot="${slot}">${options(list, c.equip[slot], none)}</select>
      <p class="eq-detail">${detail}</p></div>`;
  const armorRows = ARMOR_SLOTS.map(({ slot, name }) => {
    const list = Object.entries(ARMORS).filter(([id, a]) => a.slot === slot && own(id)).map(([id, a]) => [id, `${a.name}（${kg(a.weight)}）`] as [string, string]);
    const a = c.equip[slot] ? ARMORS[c.equip[slot]!] : null;
    const detail = a ? `重さ ${kg(a.weight)}　カット 物理${pct(a.cut.phys)}・魔力${pct(a.cut.magic)}・聖${pct(a.cut.holy)}${a.effect?.drawOnDiscard ? `　<b>付帯効果：カードの効果で手札を捨てたら、${a.effect.drawOnDiscard}枚引く</b>` : ''}` : '<span class="dim">なし</span>';
    return slotRow(slot, name, list, 'なし', detail);
  }).join('');

  // アクセサリ（指輪・タリスマン）
  const accs = c.accessories ?? [];
  const ownAccs = Object.entries(ACCESSORIES).filter(([id]) => own(id));
  const accRows = Array.from({ length: RULES.accessorySlots }, (_, i) => {
    const cur = accs[i] ?? null;
    const list = ownAccs.filter(([id]) => id === cur || !accs.includes(id)).map(([id, a]) => [id, `${a.name}（${kg(a.weight)}）`] as [string, string]);
    const a = cur ? ACCESSORIES[cur] : null;
    return `<div class="eq-row"><label for="acc-${i}">アクセサリ${i + 1}</label>
      <select id="acc-${i}" data-acc="${i}">${options(list, cur, 'なし')}</select>
      <p class="eq-detail">${a ? `${a.kind}・${accessoryText(a)}` : '<span class="dim">なし</span>'}</p></div>`;
  }).join('');

  // 淵結晶（底の武器にはめる）
  const crystals = c.inventory.crystals ?? [];
  const usedBy = new Map<string, string>();
  for (const [wid, slots] of Object.entries(c.sockets ?? {})) for (const u of slots) if (u) usedBy.set(u, wid);
  const sockWeapons = Object.entries(WEAPONS).filter(([id, w]) => w.sockets && own(id));
  const crystalSec = sockWeapons.length || crystals.length ? `
    <section class="ed-sec">
      <div class="ed-h-row"><h2 class="ed-h">淵結晶</h2><span class="lv">${crystals.length}個</span></div>
      <p class="note">底の武器には淵結晶を3つまではめられます。はめた武器を右手か左手に持っているあいだ効きます。呪われた淵結晶はマイナスもつきます。</p>
      ${sockWeapons.map(([wid, w]) => {
        const slots = c.sockets?.[wid] ?? [];
        const held = c.equip.right === wid || c.equip.left === wid;
        return `<div class="sock-w"><p class="sock-name"><b>${w.name}</b>${held ? '<span class="pts">装備中</span>' : '<span class="dim">持っていないと効かない</span>'}</p>
          ${Array.from({ length: w.sockets! }, (_, i) => {
            const cur = slots[i] ?? null;
            const list = crystals.filter((x) => x.uid === cur || !usedBy.has(x.uid)).map((x) => [x.uid, `${x.name}：${crystalText(x)}`] as [string, string]);
            return `<select class="sock ${cur && crystals.find((x) => x.uid === cur)?.minus ? 'cursed' : ''}" data-sock="${wid}:${i}" aria-label="${w.name}の穴${i + 1}">${options(list, cur, `穴${i + 1}：なし`)}</select>`;
          }).join('')}</div>`;
      }).join('') || '<p class="note dim">淵結晶をはめられる底の武器を持っていません。</p>'}
      ${lo.crystals.length ? `<p class="note">効いている淵結晶：${lo.crystals.map((x) => esc(crystalText(x))).join('／')}</p>` : ''}
    </section>` : '';

  const ratio = Math.min(lo.ratio, 1.2);
  const wc = lo.weightClass;
  const band = dodgeBand(lo.level);
  const dodgeNote = wc.dodge === null ? '' : `<p class="note dim">回避のコストは、受けるはずのダメージが大きいと増える（Lv${lo.level}：〜${band - 1}は[${wc.dodge}]、〜${band * 2 - 1}は[${wc.dodge + 1}]、〜${band * 3 - 1}は[${wc.dodge + 2}]、それ以上は[${wc.dodge + 3}]）。レベルが上がると幅も広がる。</p>`;
  const weightBox = `<div class="load">
    <div class="load-h"><span>装備重量 <b>${kg(lo.weight)}</b> / ${kg(lo.equipLoad)}（${pct(lo.ratio)}）</span><span class="wc wc-${wc.key}">${wc.name}</span></div>
    <div class="load-bar"><i style="width:${(ratio / 1.2) * 100}%"></i>
      <span style="left:${(RULES.loadLight / 1.2) * 100}%"></span><span style="left:${(RULES.loadMedium / 1.2) * 100}%"></span><span style="left:${(RULES.loadHeavy / 1.2) * 100}%"></span></div>
    <p class="note">速度 ${wc.speedDice}d6・回避 ${wc.dodge === null ? '不可' : `[${wc.dodge}]`}・防具カット 物理${pct(lo.armorCut.phys)}／魔力${pct(lo.armorCut.magic)}／聖${pct(lo.armorCut.holy)}</p>${dodgeNote}</div>`;

  // デッキ
  const counts = countCards(c.deck);
  // 持っているカードだけを並べる
  const cardRows = Object.entries(CARDS).filter(([id]) => (c.inventory.cards[id] ?? 0) > 0 || counts[id]).map(([id, card]) => {
    const n = counts[id] ?? 0;
    const have = c.inventory.cards[id] ?? 0;
    const block = cardBlock(id, stats, lo.schools, lo.right);
    const canAdd = !block && n < Math.min(RULES.copyLimit, have) && c.deck.length < RULES.deckMax;
    return `<div class="dk-row ${block ? 'blocked' : ''} ${n ? 'in' : ''}">
      <div class="dk-main"><span class="dk-kind">${card.kind}</span><b>${card.name}</b> <span class="dk-cost">${card.unplayable ? '捨てると発動' : costLabel(card.cost, card.fp)}</span>
        <p>${card.text(null)}${card.req ? `　<span class="dim">必要 ${reqLabel(card.req)}</span>` : ''}${block ? `　<b class="warn">${block}</b>` : ''}</p></div>
      <div class="dk-count">
        <button type="button" data-card="${id}" data-d="-1" aria-label="${card.name}を減らす" ${n ? '' : 'disabled'}>−</button>
        <output>${n}<small>/${have}</small></output>
        <button type="button" data-card="${id}" data-d="1" aria-label="${card.name}を増やす" ${canAdd ? '' : 'disabled'}>＋</button>
      </div></div>`;
  }).join('');

  const issueList = [
    ...issues.errors.map((t) => `<li class="err">${esc(t)}</li>`),
    ...issues.warnings.map((t) => `<li class="wrn">${esc(t)}</li>`),
  ].join('');

  $('#edBody').innerHTML = `
    ${classPick}
    <section class="ed-sec">
      <div class="ed-h-row"><h2 class="ed-h">能力値</h2>
        <span class="lv">Lv <b>${lo.level}</b>　<span class="${left ? 'pts' : 'dim'}">残り ${left}</span></span></div>
      <div class="lvup"><span>ソウル <b>${c.souls}</b></span>
        <span>${left > 0 ? '振れるポイントが残っています' : `次のレベル <b>${levelCost(lo.level)}</b> ソウル`}</span></div>
      ${left === 0 ? `<p class="note">ソウルを払って＋を押すと、レベルが上がります。ソウルは地下墓で集めます。${D.bought.length ? `この編集で${D.bought.length}レベル上げました（保存するまで取り消せます）。` : ''}</p>` : ''}
      ${c.lostLevels ? `<p class="note warn">底からの脱出や呪死で、レベルを${c.lostLevels}失っています（振れる上限が${c.lostLevels}減っています）。</p>` : ''}
      ${!isNew ? `<p class="note">保存済みの振り分けは下げられません。${left > 0 ? '残りのポイントはいつでも振れます。' : ''}</p>` : ''}
      <div class="st-list">${statRows}</div>
    </section>
    <section class="ed-sec">
      <h2 class="ed-h">装備</h2>
      <p class="note">選べるのは持っている装備だけです。新しい装備は地下墓で手に入ります。</p>
      ${slotRow('right', '右手', weaponList, '素手', handDetail(c.equip.right ? lo.right : null, stats))}
      ${slotRow('left', '左手', leftList, 'なし', handDetail(lo.left, stats))}
      ${armorRows}
      ${ownAccs.length ? accRows : `<p class="note dim">アクセサリ（指輪・タリスマン）は、地下墓の2周目以降で手に入ります。${RULES.accessorySlots}つまで身につけられます。</p>`}
      ${weightBox}
    </section>
    ${crystalSec}
    <section class="ed-sec">
      <div class="ed-h-row"><h2 class="ed-h">デッキ</h2>
        <span class="lv"><b class="${c.deck.length < RULES.deckMin || c.deck.length > RULES.deckMax ? 'warn' : ''}">${c.deck.length}</b>枚（${RULES.deckMin}〜${RULES.deckMax}・同名${RULES.copyLimit}枚まで）</span></div>
      <div class="row-btns"><button type="button" class="btn" data-deck="auto">おまかせで組む</button><button type="button" class="btn" data-deck="clear">空にする</button></div>
      <div class="dk-list">${cardRows}</div>
    </section>
    ${issueList ? `<ul class="issues">${issueList}</ul>` : ''}`;

  $<HTMLButtonElement>('#edSave').disabled = issues.errors.length > 0;
  $('#edSaveNote').textContent = issues.errors.length
    ? '上の問題を直すと保存できます。'
    : isNew ? '保存すると、振った能力値は下げられなくなります。' : '';
}

/* ---------------- 操作 ---------------- */

function onClick(ev: Event): void {
  if (!D) return;
  const t = ev.target as HTMLElement;
  const c = D.c;

  const cls = t.closest<HTMLElement>('[data-class]');
  if (cls && D.isNew) {
    const name = c.name;
    const keepName = Object.values(CLASSES).every((k) => k.name !== name) && name.trim();
    D.c = newCharacter(cls.dataset.class!, keepName ? name : undefined);
    D.c.id = c.id;
    $<HTMLInputElement>('#edName').value = D.c.name;
    return render();
  }

  const st = t.closest<HTMLButtonElement>('[data-stat]');
  if (st && !st.disabled) {
    const k = st.dataset.stat as StatKey;
    if (Number(st.dataset.d) > 0) {
      // ポイントが残っていればそれを使い、なければソウルでレベルを買う
      if (allocTotal(c.alloc) >= levelBudget(c)) {
        if (!canBuyLevel(c)) return render();
        D.c = { ...buyLevel(c), alloc: { ...c.alloc } };
        D.bought.push(k);
      }
      D.c.alloc[k] += 1;
    } else {
      c.alloc[k] -= 1;
      // この編集で買ったレベルなら払い戻す（最後に買ったものから）
      const i = D.bought.lastIndexOf(k);
      if (i >= 0) {
        D.bought.splice(i, 1);
        c.boughtLevels = (c.boughtLevels ?? 1) - 1;
        c.souls += levelCost(charLevel(c));
      }
    }
    return render();
  }

  const cd = t.closest<HTMLButtonElement>('[data-card]');
  if (cd && !cd.disabled) {
    const id = cd.dataset.card!;
    if (Number(cd.dataset.d) > 0) c.deck.push(id);
    else c.deck.splice(c.deck.lastIndexOf(id), 1);
    return render();
  }

  const dk = t.closest<HTMLElement>('[data-deck]');
  if (dk) {
    if (dk.dataset.deck === 'auto') {
      const lo = loadout(c);
      c.deck = autoDeck(lo.stats, lo.schools, lo.right, c.inventory.cards);
    } else c.deck = [];
    return render();
  }
}

function onChange(ev: Event): void {
  if (!D) return;
  const t = ev.target as HTMLSelectElement;
  if (t.dataset.sock) {
    const [wid, i] = t.dataset.sock.split(':');
    const n = WEAPONS[wid]?.sockets ?? 0;
    const sockets = { ...(D.c.sockets ?? {}) };
    // 同じ淵結晶は1か所にだけ
    if (t.value) for (const k of Object.keys(sockets)) sockets[k] = sockets[k].map((u) => (u === t.value ? null : u));
    const slots = Array.from({ length: n }, (_, j) => sockets[wid]?.[j] ?? null);
    slots[Number(i)] = t.value || null;
    sockets[wid] = slots;
    D.c.sockets = sockets;
    return render();
  }
  if (t.dataset.acc !== undefined) {
    const list = [...(D.c.accessories ?? [])];
    const i = Number(t.dataset.acc);
    if (t.value) list[i] = t.value;
    else list.splice(i, 1);
    D.c.accessories = [...new Set(list.filter(Boolean))].slice(0, RULES.accessorySlots);
    return render();
  }
  const slot = t.dataset.slot as EquipSlot | undefined;
  if (!slot) return;
  D.c.equip[slot] = t.value || null;
  render();
}

function save(): void {
  if (!D) return;
  const c = D.c;
  c.name = $<HTMLInputElement>('#edName').value.trim().slice(0, 24);
  if (checkCharacter(c, { minAlloc: D.minAlloc ?? undefined }).errors.length) return render();
  c.updatedAt = Date.now();
  upsertCharacter(clone(c));
  D = null;
  onDone();
}

export function bindEditor(): void {
  $('#edBody').addEventListener('click', onClick);
  $('#edBody').addEventListener('change', onChange);
  $('#edName').addEventListener('input', (e) => {
    if (!D) return;
    D.c.name = (e.target as HTMLInputElement).value;
    render();
  });
  $('#edSave').addEventListener('click', save);
  $('#edBack').addEventListener('click', () => {
    D = null;
    onDone();
  });
}
