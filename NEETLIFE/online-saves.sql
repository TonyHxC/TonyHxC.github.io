-- Pogey Life: online saves for player codes.
-- Run this once in Supabase: Dashboard -> SQL Editor -> New query -> paste all of this -> Run.
-- (Same project as the Plinko leaderboard.)
--
-- How it works: each character's save is stored under its player code (e.g. K7QM-3XRP-9FHT).
-- The table itself is locked: nobody can list or browse it. The game can only call the two functions
-- below, which save or load ONE character by its exact code. The code works like a password, so
-- with ~59 bits of randomness nobody can guess other players' codes.

create table if not exists public.pogey_saves (
  code       text primary key check (code ~ '^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$'),
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

-- Row level security on with no policies = no direct reads or writes from the website.
alter table public.pogey_saves enable row level security;

create or replace function public.pogey_save(p_code text, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_code !~ '^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$' then
    raise exception 'bad player code';
  end if;
  if pg_column_size(p_data) > 500000 then
    raise exception 'save too large';
  end if;
  insert into public.pogey_saves (code, data, updated_at)
  values (p_code, p_data, now())
  on conflict (code) do update set data = excluded.data, updated_at = now();
end;
$$;

create or replace function public.pogey_load(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select data from public.pogey_saves where code = upper(p_code);
$$;

revoke all on function public.pogey_save(text, jsonb) from public;
revoke all on function public.pogey_load(text) from public;
grant execute on function public.pogey_save(text, jsonb) to anon, authenticated;
grant execute on function public.pogey_load(text) to anon, authenticated;
