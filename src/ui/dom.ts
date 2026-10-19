export const $ = <T extends HTMLElement = HTMLElement>(s: string): T => {
  const el = document.querySelector<T>(s);
  if (!el) throw new Error(`missing element ${s}`);
  return el;
};

/** 利用者が入力した文字列を HTML に入れるとき用 */
export const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export type Screen = 'home' | 'editor' | 'versus' | 'battle' | 'dungeon' | 'run';
const SCREENS: Screen[] = ['home', 'editor', 'versus', 'battle', 'dungeon', 'run'];

export function show(screen: Screen): void {
  for (const s of SCREENS) $(`#${s}`).hidden = s !== screen;
  window.scrollTo(0, 0);
}

const PIPS: Record<number, number[]> = {
  1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
};
export function dieHTML(v: number, cls = '', tag = 'span', attrs = ''): string {
  const cells = Array.from({ length: 9 }, (_, i) => `<i class="${PIPS[v].includes(i) ? 'p' : ''}"></i>`).join('');
  return `<${tag} class="die ${cls}" ${attrs} aria-label="${v}">${cells}</${tag}>`;
}
