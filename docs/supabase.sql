-- キャラクターの保存先（Supabase の SQL Editor で実行済み）
create table public.characters (
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  data jsonb not null,
  save_version int not null default 1,
  updated_at timestamptz not null default now(),
  primary key (owner, id)
);

alter table public.characters enable row level security;

create policy "自分のキャラを読む" on public.characters
  for select to authenticated using (owner = (select auth.uid()));
create policy "自分のキャラを追加" on public.characters
  for insert to authenticated with check (owner = (select auth.uid()));
create policy "自分のキャラを更新" on public.characters
  for update to authenticated using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
create policy "自分のキャラを削除" on public.characters
  for delete to authenticated using (owner = (select auth.uid()));
