-- Regression (P0 2026-11-03): ingesting the same game twice from both sources
-- (SportsDataIO path sdio-*, ESPN fallback espn-*) must yield ONE games row.
-- Run inside a transaction; it rolls itself back.
begin;
insert into public.games (id, sport, status, home_team_id, away_team_id, scheduled_at, broadcast, venue)
select 'sdio-990000001', 'ncaam', 'scheduled', h.id, a.id, '2030-01-01 23:00Z', 'SECN', 'Thompson-Boling Arena at Food City Center, Knoxville, TN'
from public.teams h, public.teams a where h.id = 'sdio-277' and a.id = 'sdio-285'
on conflict (id) do update set updated_at = now();
insert into public.games (id, sport, status, home_team_id, away_team_id, scheduled_at, broadcast, venue)
values ('espn-990000001', 'ncaam', 'scheduled', 'sdio-277', 'sdio-285', '2030-01-01 23:00Z', 'SEC Network', 'Food City Center, Knoxville, TN')
on conflict (id) do update set updated_at = now();
-- second pass of both sources
insert into public.games (id, sport, status, home_team_id, away_team_id, scheduled_at, broadcast)
values ('sdio-990000001', 'ncaam', 'inprogress', 'sdio-277', 'sdio-285', '2030-01-01 23:00Z', 'SECN')
on conflict (id) do update set status = excluded.status, broadcast = excluded.broadcast;
insert into public.games (id, sport, status, home_team_id, away_team_id, scheduled_at, broadcast)
values ('espn-990000001', 'ncaam', 'inprogress', 'sdio-277', 'sdio-285', '2030-01-01 23:05Z', 'SEC Network')
on conflict (id) do update set status = excluded.status;
do $$ declare n int; b text; begin
  select count(*), max(broadcast) into n, b from public.games where scheduled_at between '2030-01-01 20:00Z' and '2030-01-02 02:00Z' and sport = 'ncaam';
  if n <> 1 then raise exception 'expected 1 game, got %', n; end if;
  if b <> 'SEC Network' then raise exception 'broadcast not normalized: %', b; end if;
  raise notice 'PASS games_canonical_dedupe: 1 row, broadcast=%', b;
end $$;
rollback;
