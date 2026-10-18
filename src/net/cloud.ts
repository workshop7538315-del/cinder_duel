import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { Character } from '../character/model';
import { SAVE_VERSION, sanitizeCharacter } from '../character/storage';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './config';

/** ライブラリが大きいので、画面を出したあとで読み込む */
let client: Promise<SupabaseClient> | null = null;
function sb(): Promise<SupabaseClient> {
  client ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    }),
  );
  return client;
}

export interface Account {
  id: string;
  name: string;
}

function toAccount(s: Session | null): Account | null {
  if (!s) return null;
  const m = s.user.user_metadata ?? {};
  const name = (m.custom_claims?.global_name || m.full_name || m.name || m.user_name || s.user.email || 'ログイン中') as string;
  return { id: s.user.id, name };
}

/** ログイン状態が変わるたびに呼ばれる（起動時にも1回） */
export async function watchAccount(cb: (a: Account | null) => void): Promise<void> {
  (await sb()).auth.onAuthStateChange((_event, session) => {
    // コールバックの中で Supabase を呼ぶと詰まることがあるので、一拍おいて渡す
    setTimeout(() => cb(toAccount(session)), 0);
  });
}

export async function signInWithDiscord(): Promise<void> {
  const redirectTo = location.origin + location.pathname;
  const { error } = await (await sb()).auth.signInWithOAuth({ provider: 'discord', options: { redirectTo } });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  await (await sb()).auth.signOut();
}

/* ---------------- キャラクター ---------------- */

interface Row {
  owner?: string;
  id: string;
  data: unknown;
  save_version: number;
  updated_at: string;
}

export async function fetchCharacters(): Promise<Character[]> {
  const { data, error } = await (await sb()).from('characters').select('id, data, save_version, updated_at');
  if (error) throw error;
  return (data as Row[]).map((r) => sanitizeCharacter(r.data)).filter((c): c is Character => !!c);
}

export async function uploadCharacters(owner: string, chars: Character[]): Promise<void> {
  if (!chars.length) return;
  const rows: Row[] = chars.map((c) => ({
    owner, id: c.id, data: c, save_version: SAVE_VERSION, updated_at: new Date(c.updatedAt).toISOString(),
  }));
  const { error } = await (await sb()).from('characters').upsert(rows, { onConflict: 'owner,id' });
  if (error) throw error;
}

export async function deleteRemoteCharacter(id: string): Promise<void> {
  const { error } = await (await sb()).from('characters').delete().eq('id', id);
  if (error) throw error;
}
