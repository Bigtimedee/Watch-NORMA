-- P0 2026-11-03: NCAAM games duplicated on the Games tab.
--
-- Root cause: poll-schedule writes NCAAM games under two id namespaces with
-- `upsert(onConflict: "id")` only:
--   * SportsDataIO path      -> id `sdio-<GameID>`   (sdio teams, venue/network from SDIO: "SECN")
--   * ESPN fallback path     -> id `espn-<eventId>`  (runs whenever SDIO is unavailable; "SEC Network")
-- Nothing ties the two together (espn_id was never populated, no canonical key),
-- so every game ingested by both paths existed twice. The ESPN fallback also
-- fuzzy-matched teams across ALL sports, so it attached NCAAF team rows
-- (espn-ncaaf-tenn) to basketball games, which made the rows differ by team id too.
--
-- Fix:
--   1. normalize_broadcast()/normalize_venue() helpers.
--   2. games.canonical_key = sport|home|away|ET date (ET hour for MLB doubleheaders),
--      maintained by trigger, UNIQUE index.
--   3. BEFORE INSERT trigger: if a new id fuzzy-matches an existing game (same sport,
--      start within 3h (MLB 30m), from a different source namespace, same team by id/full name, or same home market
--      + same away prefix) the insert is folded into the existing row and skipped,
--      so every ingest path effectively upserts on the canonical game.
--   4. One-time merge of existing duplicates: survivor = row with most user refs,
--      then most recently updated; all referencing rows remapped (conflicts deduped).

create or replace function public.norm_team_text(t text)
returns text language sql immutable as $$
  select regexp_replace(lower(coalesce(t, '')), '[^a-z0-9]', '', 'g')
$$;

create or replace function public.normalize_broadcast(b text)
returns text language plpgsql immutable as $$
declare
  parts text[];
  p text;
  out_parts text[] := '{}';
  m text;
begin
  if b is null or btrim(b) = '' then return null; end if;
  parts := regexp_split_to_array(b, '\s*[,/]\s*');
  foreach p in array parts loop
    p := btrim(p);
    continue when p = '';
    m := case upper(p)
      when 'SECN' then 'SEC Network'
      when 'SEC' then 'SEC Network'
      when 'SEC NETWORK' then 'SEC Network'
      when 'SECN+' then 'SEC Network+'
      when 'SEC NETWORK+' then 'SEC Network+'
      when 'ACC' then 'ACC Network'
      when 'ACCN' then 'ACC Network'
      when 'ACC NETWORK' then 'ACC Network'
      when 'ACCNX' then 'ACC Network Extra'
      when 'ACC NETWORK EXTRA' then 'ACC Network Extra'
      when 'BTN' then 'Big Ten Network'
      when 'B1G' then 'Big Ten Network'
      when 'BIG TEN NETWORK' then 'Big Ten Network'
      when 'BTN+' then 'B1G+'
      when 'LHN' then 'Longhorn Network'
      when 'PAC12' then 'Pac-12 Network'
      when 'P12N' then 'Pac-12 Network'
      when 'FLOC' then 'FloSports'
      when 'FLOHOOPS' then 'FloSports'
      when 'FLOSPORTS' then 'FloSports'
      when 'ESPNPLUS' then 'ESPN+'
      when 'ESPN PLUS' then 'ESPN+'
      when 'FS1' then 'FS1'
      when 'CBSSN' then 'CBS Sports Network'
      when 'CBS SPORTS NETWORK' then 'CBS Sports Network'
      when 'NFLN' then 'NFL Network'
      when 'NFL NET' then 'NFL Network'
      else p end;
    if not (m = any(out_parts)) then out_parts := out_parts || m; end if;
  end loop;
  if array_length(out_parts, 1) is null then return null; end if;
  return array_to_string(out_parts, ', ');
end $$;

create or replace function public.normalize_venue(v text)
returns text language sql immutable as $$
  select nullif(btrim(regexp_replace(regexp_replace(coalesce(v, ''), '\s+', ' ', 'g'), '(,\s*)+$', '')), '')
$$;

create or replace function public.game_canonical_key(p_sport text, p_home text, p_away text, p_at timestamptz)
returns text language sql stable as $$
  select p_sport || '|' ||
    coalesce(public.norm_team_text((select name from public.teams where id = p_home)), p_home, '') || '|' ||
    coalesce(public.norm_team_text((select name from public.teams where id = p_away)), p_away, '') || '|' ||
    coalesce(to_char(p_at at time zone 'America/New_York',
      case when p_sport = 'mlb' then 'YYYY-MM-DD"T"HH24' else 'YYYY-MM-DD' end), '')
$$;

-- Fuzzy "is this the same real-world game" test, shared by the trigger and the merge.
create or replace function public.games_same_event(a public.games, b public.games)
returns boolean language sql stable as $$
  select a.id <> b.id
    -- duplicates only ever come from two different ingest namespaces (sdio-* vs espn-*);
    -- within one source the external id is authoritative (MLB doubleheaders etc.)
    and split_part(a.id, '-', 1) <> split_part(b.id, '-', 1)
    and a.sport is not distinct from b.sport
    and a.scheduled_at is not null and b.scheduled_at is not null
    and abs(extract(epoch from a.scheduled_at - b.scheduled_at)) <=
        case when a.sport::text = 'mlb' then 1800 else 10800 end
    and (
      a.home_team_id = b.home_team_id
      or a.away_team_id = b.away_team_id
      or exists (
        select 1 from public.teams ah, public.teams bh, public.teams aa, public.teams ba
        where ah.id = a.home_team_id and bh.id = b.home_team_id
          and aa.id = a.away_team_id and ba.id = b.away_team_id
          and (
            public.norm_team_text(ah.name) = public.norm_team_text(bh.name)
            or public.norm_team_text(aa.name) = public.norm_team_text(ba.name)
            or (public.norm_team_text(ah.market) = public.norm_team_text(bh.market)
                and public.norm_team_text(ah.market) <> ''
                and left(public.norm_team_text(aa.name), 4) = left(public.norm_team_text(ba.name), 4))
          )
      )
    )
$$;

alter table public.games add column if not exists canonical_key text;

create or replace function public.games_canonicalize()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  existing public.games;
begin
  new.broadcast := public.normalize_broadcast(new.broadcast);
  new.venue := public.normalize_venue(new.venue);
  if new.espn_id is null and new.id ~ '^espn-([a-z]+-)?[0-9]+$' then
    new.espn_id := regexp_replace(new.id, '^espn-([a-z]+-)?', '');
  end if;

  if tg_op = 'INSERT' and not exists (select 1 from public.games where id = new.id) then
    select g.* into existing from public.games g
      where g.sport is not distinct from new.sport
        and g.scheduled_at between new.scheduled_at - interval '3 hours' and new.scheduled_at + interval '3 hours'
        and public.games_same_event(g, new)
      order by abs(extract(epoch from g.scheduled_at - new.scheduled_at)), g.id
      limit 1;
    if found then
      -- Fold this source's data into the canonical row; skip the duplicate insert.
      update public.games g set
        status = case when g.status in ('closed', 'cancelled', 'postponed')
                       and new.status in ('scheduled', 'created') then g.status
                      else coalesce(new.status, g.status) end,
        home_score = coalesce(new.home_score, g.home_score),
        away_score = coalesce(new.away_score, g.away_score),
        clock = coalesce(new.clock, g.clock),
        period = coalesce(new.period, g.period),
        broadcast = coalesce(g.broadcast, new.broadcast),
        venue = coalesce(g.venue, new.venue),
        sportsdataio_id = coalesce(g.sportsdataio_id, new.sportsdataio_id),
        sportradar_id = coalesce(g.sportradar_id, new.sportradar_id),
        coverage_level = coalesce(g.coverage_level, new.coverage_level),
        espn_id = coalesce(g.espn_id, new.espn_id),
        tournament_round = coalesce(g.tournament_round, new.tournament_round),
        title = coalesce(g.title, new.title),
        updated_at = now()
      where g.id = existing.id;
      return null;
    end if;
  end if;

  new.canonical_key := public.game_canonical_key(new.sport::text, new.home_team_id, new.away_team_id, new.scheduled_at);
  return new;
end $$;

drop trigger if exists trg_games_canonicalize on public.games;
create trigger trg_games_canonicalize
  before insert or update on public.games
  for each row execute function public.games_canonicalize();

-- ── One-time merge of existing duplicates ────────────────────────────────
create table if not exists public.game_merge_log (
  duplicate_id text primary key,
  survivor_id text not null,
  remapped jsonb not null default '{}',
  merged_at timestamptz not null default now()
);
alter table public.game_merge_log enable row level security;

create or replace function public.merge_duplicate_game(p_dup text, p_surv text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r jsonb := '{}';
  n int;
  d public.games;
  s public.games;
begin
  select * into d from games where id = p_dup;
  select * into s from games where id = p_surv;
  if d.id is null or s.id is null then return null; end if;

  -- unique-keyed children: drop the duplicate's row where the survivor already has one
  delete from follows f where f.game_id = p_dup and exists (select 1 from follows x where x.user_id = f.user_id and x.game_id = p_surv);
  get diagnostics n = row_count; r := r || jsonb_build_object('follows_deduped', n);
  delete from follows f where f.entity_type = 'game' and f.entity_id = p_dup and exists (select 1 from follows x where x.user_id = f.user_id and x.entity_type = 'game' and x.entity_id = p_surv);
  update follows set game_id = p_surv where game_id = p_dup; get diagnostics n = row_count; r := r || jsonb_build_object('follows', n);
  update follows set entity_id = p_surv where entity_type = 'game' and entity_id = p_dup;

  delete from alert_throttle a where a.game_id = p_dup and exists (select 1 from alert_throttle x where x.user_id = a.user_id and x.game_id = p_surv and x.alert_type = a.alert_type and x.dedup_hash is not distinct from a.dedup_hash);
  update alert_throttle set game_id = p_surv where game_id = p_dup; get diagnostics n = row_count; r := r || jsonb_build_object('alert_throttle', n);

  delete from game_events e where e.game_id = p_dup and exists (select 1 from game_events x where x.game_id = p_surv and x.sequence = e.sequence);
  update game_events set game_id = p_surv where game_id = p_dup; get diagnostics n = row_count; r := r || jsonb_build_object('game_events', n);

  delete from game_state_cache where game_id = p_dup and exists (select 1 from game_state_cache where game_id = p_surv);
  update game_state_cache set game_id = p_surv where game_id = p_dup;
  delete from game_summary_cache where game_id = p_dup and exists (select 1 from game_summary_cache where game_id = p_surv);
  update game_summary_cache set game_id = p_surv where game_id = p_dup;
  delete from watcher_state where game_id = p_dup and exists (select 1 from watcher_state where game_id = p_surv);
  update watcher_state set game_id = p_surv where game_id = p_dup;
  delete from mlb_game_stats where game_id = p_dup and exists (select 1 from mlb_game_stats where game_id = p_surv);
  update mlb_game_stats set game_id = p_surv where game_id = p_dup;

  update alerts set game_id = p_surv where game_id = p_dup; get diagnostics n = row_count; r := r || jsonb_build_object('alerts', n);
  update intent_moments set game_id = p_surv where game_id = p_dup; get diagnostics n = row_count; r := r || jsonb_build_object('intent_moments', n);
  update wagers set game_id = p_surv where game_id = p_dup; get diagnostics n = row_count; r := r || jsonb_build_object('wagers', n);
  update prediction_positions set game_id = p_surv where game_id = p_dup; get diagnostics n = row_count; r := r || jsonb_build_object('prediction_positions', n);
  update bids set game_id = p_surv where game_id = p_dup; get diagnostics n = row_count; r := r || jsonb_build_object('bids', n);
  update share_events set game_id = p_surv where game_id = p_dup; get diagnostics n = row_count; r := r || jsonb_build_object('share_events', n);
  update social_posts set game_id = p_surv where game_id = p_dup; get diagnostics n = row_count; r := r || jsonb_build_object('social_posts', n);
  update game_snapshots set game_id = p_surv where game_id = p_dup; get diagnostics n = row_count; r := r || jsonb_build_object('game_snapshots', n);
  update impressions set game_id = p_surv where game_id = p_dup; get diagnostics n = row_count; r := r || jsonb_build_object('impressions', n);

  -- carry source ids / sport-correct teams onto the survivor, then drop the duplicate
  delete from games where id = p_dup;
  update games set
    sportsdataio_id = coalesce(s.sportsdataio_id, d.sportsdataio_id),
    sportradar_id = coalesce(s.sportradar_id, d.sportradar_id),
    coverage_level = coalesce(s.coverage_level, d.coverage_level),
    espn_id = coalesce(s.espn_id, d.espn_id),
    tournament_round = coalesce(s.tournament_round, d.tournament_round),
    broadcast = coalesce(s.broadcast, d.broadcast),
    venue = coalesce(s.venue, d.venue),
    home_team_id = case when (select sport from teams where id = s.home_team_id) is distinct from s.sport
                         and (select sport from teams where id = d.home_team_id) = s.sport
                        then d.home_team_id else s.home_team_id end,
    away_team_id = case when (select sport from teams where id = s.away_team_id) is distinct from s.sport
                         and (select sport from teams where id = d.away_team_id) = s.sport
                        then d.away_team_id else s.away_team_id end
  where id = p_surv;

  insert into game_merge_log(duplicate_id, survivor_id, remapped) values (p_dup, p_surv, r)
    on conflict (duplicate_id) do update set survivor_id = excluded.survivor_id, remapped = excluded.remapped;
  return r;
end $$;

do $$
declare
  pr record;
begin
  for pr in
    with refs as (
      select g.id,
        (select count(*) from follows where game_id = g.id) + (select count(*) from alerts where game_id = g.id)
        + (select count(*) from wagers where game_id = g.id) + (select count(*) from prediction_positions where game_id = g.id)
        + (select count(*) from intent_moments where game_id = g.id) as n
      from games g
    ), pairs as (
      select a.id a_id, b.id b_id, ra.n a_n, rb.n b_n, a.updated_at a_u, b.updated_at b_u
      from games a join games b
        on a.id < b.id and a.sport is not distinct from b.sport
       and b.scheduled_at between a.scheduled_at - interval '3 hours' and a.scheduled_at + interval '3 hours'
       and public.games_same_event(a, b)
      join refs ra on ra.id = a.id join refs rb on rb.id = b.id
    )
    select case when (a_n, coalesce(a_u, 'epoch')) >= (b_n, coalesce(b_u, 'epoch')) then a_id else b_id end surv,
           case when (a_n, coalesce(a_u, 'epoch')) >= (b_n, coalesce(b_u, 'epoch')) then b_id else a_id end dup
    from pairs
  loop
    -- chains/groups >2: skip pairs whose rows were already merged away
    if exists (select 1 from games where id = pr.dup) and exists (select 1 from games where id = pr.surv) then
      perform public.merge_duplicate_game(pr.dup, pr.surv);
    end if;
  end loop;
end $$;

-- Backfill normalized fields + canonical key on every remaining row, then lock it in.
update public.games set broadcast = broadcast;
create unique index if not exists games_canonical_key_unique on public.games (canonical_key);

revoke execute on function public.merge_duplicate_game(text, text) from public, anon, authenticated;
