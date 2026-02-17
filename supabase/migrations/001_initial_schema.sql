-- NORMA Initial Schema

-- Users (extends Supabase auth.users)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  push_token text,
  timezone text default 'America/New_York',
  notifications_enabled boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Teams
create table public.teams (
  id text primary key,
  name text not null,
  market text,
  abbreviation text,
  conference text,
  logo_url text,
  sportsdataio_id integer,
  created_at timestamptz default now()
);

-- Games
create table public.games (
  id text primary key,
  sportsdataio_id integer,
  status text not null,
  title text,
  home_team_id text references public.teams(id),
  away_team_id text references public.teams(id),
  home_score integer default 0,
  away_score integer default 0,
  clock text,
  period integer,
  scheduled_at timestamptz not null,
  venue text,
  broadcast text,
  coverage text,
  tournament_round text,
  snapshot_hash text,
  updated_at timestamptz default now()
);

-- Game Snapshots
create table public.game_snapshots (
  id bigint generated always as identity primary key,
  game_id text references public.games(id) on delete cascade,
  snapshot_type text not null,
  payload jsonb not null,
  payload_hash text not null,
  created_at timestamptz default now()
);

-- User follows
create table public.follows (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  game_id text references public.games(id) on delete cascade,
  team_id text references public.teams(id) on delete cascade,
  follow_type text not null,
  created_at timestamptz default now(),
  constraint follows_game_or_team check (
    (follow_type = 'game' and game_id is not null and team_id is null) or
    (follow_type = 'team' and team_id is not null and game_id is null)
  ),
  unique(user_id, game_id),
  unique(user_id, team_id)
);

-- User connections
create table public.connections (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  provider_type text not null,
  provider_key text not null,
  provider_name text not null,
  connected boolean default true,
  metadata jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, provider_type, provider_key)
);

-- Streaming providers catalog
create table public.streaming_providers (
  key text primary key,
  name text not null,
  provider_type text not null,
  logo_url text,
  ios_scheme text,
  ios_app_store_url text,
  android_package text,
  android_deep_link text,
  web_url text,
  active boolean default true
);

-- Alerts
create table public.alerts (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  game_id text references public.games(id) on delete cascade,
  alert_type text not null,
  title text not null,
  body text not null,
  why text,
  push_sent boolean default false,
  read boolean default false,
  created_at timestamptz default now()
);

-- Manual wagers (v1.1)
create table public.wagers (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  game_id text references public.games(id),
  sportsbook text,
  wager_type text,
  description text not null,
  team_id text references public.teams(id),
  line numeric,
  odds text,
  status text default 'active',
  created_at timestamptz default now()
);

-- Indexes
create index idx_games_status on public.games(status);
create index idx_games_scheduled on public.games(scheduled_at);
create index idx_follows_user on public.follows(user_id);
create index idx_alerts_user on public.alerts(user_id, created_at desc);
create index idx_game_snapshots_game on public.game_snapshots(game_id, created_at desc);
create index idx_games_sportsdataio on public.games(sportsdataio_id);
create index idx_teams_sportsdataio on public.teams(sportsdataio_id);

-- Row Level Security
alter table public.profiles enable row level security;
alter table public.follows enable row level security;
alter table public.connections enable row level security;
alter table public.alerts enable row level security;
alter table public.wagers enable row level security;
alter table public.games enable row level security;
alter table public.teams enable row level security;
alter table public.streaming_providers enable row level security;
alter table public.game_snapshots enable row level security;

-- RLS Policies
create policy "Users read own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users update own profile" on public.profiles for update using (auth.uid() = id);
create policy "Users insert own profile" on public.profiles for insert with check (auth.uid() = id);
create policy "Users manage own follows" on public.follows for all using (auth.uid() = user_id);
create policy "Users manage own connections" on public.connections for all using (auth.uid() = user_id);
create policy "Users read own alerts" on public.alerts for select using (auth.uid() = user_id);
create policy "Users update own alerts" on public.alerts for update using (auth.uid() = user_id);
create policy "Users manage own wagers" on public.wagers for all using (auth.uid() = user_id);
create policy "Anyone reads games" on public.games for select using (true);
create policy "Anyone reads teams" on public.teams for select using (true);
create policy "Anyone reads providers" on public.streaming_providers for select using (true);
create policy "Anyone reads snapshots" on public.game_snapshots for select using (true);

-- Trigger to auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Enable realtime for games and alerts
alter publication supabase_realtime add table public.games;
alter publication supabase_realtime add table public.alerts;
