-- Quaderno di Leo: una sola tabella, ogni riga appartiene a chi ha fatto il login.
create table if not exists public.docs (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  col text not null,
  id text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, col, id)
);

alter table public.docs enable row level security;

drop policy if exists "docs_own_select" on public.docs;
drop policy if exists "docs_own_insert" on public.docs;
drop policy if exists "docs_own_update" on public.docs;
drop policy if exists "docs_own_delete" on public.docs;

create policy "docs_own_select" on public.docs for select to authenticated using (user_id = auth.uid());
create policy "docs_own_insert" on public.docs for insert to authenticated with check (user_id = auth.uid());
create policy "docs_own_update" on public.docs for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "docs_own_delete" on public.docs for delete to authenticated using (user_id = auth.uid());

-- aggiornamenti in tempo reale tra telefono e altri dispositivi
alter table public.docs replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.docs;
exception when duplicate_object then null; end $$;
