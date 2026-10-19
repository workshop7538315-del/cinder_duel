/** 画面下からのシート。押されたボタンの data-v を返す。 */
const root = () => document.getElementById('modal') as HTMLElement;

function close(): void {
  const M = root();
  M.hidden = true;
  M.onclick = null;
  M.innerHTML = '';
}

export function modal(html: string): Promise<string> {
  return new Promise((res) => {
    const M = root();
    M.innerHTML = `<div class="sheet">${html}</div>`;
    M.hidden = false;
    M.onclick = (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-v]');
      if (!b || b.disabled) return;
      close();
      res(b.dataset.v ?? '');
    };
    M.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  });
}

interface CountOpts {
  head?: string;
  title?: string;
  text?: string;
  max: number;
  def: number;
  btn: string;
  /** 指定すると「振らない」系のボタンを出し、押されたら -1 を返す */
  alt?: string;
  /** 指定すると特別な行動のボタンを出し、押されたら -2 を返す */
  extra?: { label: string; note: string };
}

/** 振るダイスの個数を選ぶ */
export function askCount({ head = '', title = '', text = '', max, def, btn, alt, extra }: CountOpts): Promise<number> {
  return new Promise((res) => {
    const M = root();
    let k = Math.min(max, Math.max(0, def));
    M.innerHTML = `<div class="sheet">${head}${title ? `<h3>${title}</h3>` : ''}${text ? `<p class="note">${text}</p>` : ''}
      <div class="stepper"><button type="button" data-s="-1" aria-label="減らす">−</button><output id="cnt">${k}</output>
      <button type="button" data-s="1" aria-label="増やす">＋</button><span class="of">／ ${max}個</span></div>
      <div class="btns"><button type="button" class="primary" data-go ${max === 0 ? 'disabled' : ''}>${btn}</button>${alt ? `<button type="button" data-alt>${alt}</button>` : ''}
      ${extra ? `<button type="button" class="special" data-extra>${extra.label}<small>${extra.note}</small></button>` : ''}</div></div>`;
    M.hidden = false;
    M.onclick = (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
      if (!b) return;
      if (b.dataset.s) {
        k = Math.min(max, Math.max(0, k + Number(b.dataset.s)));
        const out = M.querySelector('#cnt');
        if (out) out.textContent = String(k);
      } else if ('go' in b.dataset) {
        close();
        res(k);
      } else if ('alt' in b.dataset) {
        close();
        res(-1);
      } else if ('extra' in b.dataset) {
        close();
        res(-2);
      }
    };
    M.querySelector<HTMLButtonElement>('[data-go]:not(:disabled), [data-extra]')?.focus();
  });
}
