-- Plinko Roguelite: global leaderboard setup
-- Paste this whole file into Supabase → SQL Editor → New query → Run.

-- Every finished run is stored here.
create table if not exists public.runs (
  id          bigint generated always as identity primary key,
  player_id   uuid        not null,
  name        text        not null check (char_length(name) between 2 and 16),
  floor       int         not null check (floor between 1 and 500),
  score       bigint      not null check (score between 0 and 1000000000),
  best_ball   bigint      not null default 0 check (best_ball >= 0),
  created_at  timestamptz not null default now()
);

create index if not exists runs_rank_idx on public.runs (floor desc, score desc);
create index if not exists runs_player_idx on public.runs (player_id, created_at desc);

-- Anyone may add a run and read scores; nobody can edit or delete from the game.
alter table public.runs enable row level security;

drop policy if exists "anyone can submit runs" on public.runs;
create policy "anyone can submit runs" on public.runs
  for insert to anon with check (true);

drop policy if exists "anyone can read runs" on public.runs;
create policy "anyone can read runs" on public.runs
  for select to anon using (true);

grant insert, select on public.runs to anon;

-- Each player's best run, shown with the name they use now.
create or replace view public.leaderboard
with (security_invoker = true) as
select
  b.player_id,
  (select r.name from public.runs r
     where r.player_id = b.player_id
     order by r.created_at desc limit 1) as name,
  b.floor,
  b.score,
  b.created_at
from (
  select distinct on (player_id) player_id, floor, score, created_at
  from public.runs
  order by player_id, floor desc, score desc
) b;

grant select on public.leaderboard to anon;
