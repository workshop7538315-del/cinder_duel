import { signInWithDiscord, type Account } from '../net/cloud';
import { $ } from './dom';

/**
 * 入口のパスワード。ログイン（アカウント同期）していない人だけに求める。
 * パスワードそのものは置かず、ハッシュだけを置く（公開リポジトリのため）。
 * ※ブラウザ内だけの確認なので、身内以外を遠ざける程度の効き目しかない。
 */
const SALT = 'cinder_duel:';
const GATE_HASH = '495f27b2995b44b9114e70dd93cd6fab0dc588b8ae3ee7056c17baab7f1e85c6';
const UNLOCK_KEY = 'cinder_duel.gate';
/** ログイン状態の確認を待つ上限 */
const ACCOUNT_WAIT_MS = 4000;

type GateState = 'checking' | 'locked' | 'open';
let state: GateState = 'checking';

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function rememberedUnlock(): boolean {
  try {
    return localStorage.getItem(UNLOCK_KEY) === GATE_HASH;
  } catch {
    return false;
  }
}

function open(): void {
  state = 'open';
  document.body.classList.remove('locked');
  $('#gate').hidden = true;
}

function lock(): void {
  if (state === 'open') return;
  state = 'locked';
  $('#gateChecking').hidden = true;
  $('#gateForm').hidden = false;
  $<HTMLInputElement>('#gatePass').focus();
}

/** ログイン状態がわかったら呼ぶ */
export function gateAccount(a: Account | null): void {
  if (state === 'open') return;
  if (a) open();
  else lock();
}

/** ログイン機能が読み込めなかったとき */
export function gateAccountUnavailable(): void {
  if (state === 'checking') lock();
}

export function startGate(): void {
  if (rememberedUnlock()) return open();
  setTimeout(gateAccountUnavailable, ACCOUNT_WAIT_MS);

  $('#gateForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $<HTMLInputElement>('#gatePass');
    const msg = $('#gateMsg');
    if ((await sha256(SALT + input.value.trim())) === GATE_HASH) {
      try {
        localStorage.setItem(UNLOCK_KEY, GATE_HASH);
      } catch {
        /* 覚えておけなくても今回は入れる */
      }
      open();
    } else {
      msg.textContent = 'パスワードが違います。';
      input.select();
    }
  });
  $('#gateLogin').addEventListener('click', async () => {
    try {
      await signInWithDiscord();
    } catch {
      $('#gateMsg').textContent = 'ログインを始められませんでした。通信状況を確かめてください。';
    }
  });
}
