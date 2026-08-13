-- Initial schema: profiles, provider connections, conversions, credit ledger.
--
-- Design notes worth keeping in mind before you change anything here:
--   * credit_ledger is APPEND ONLY. There is deliberately no balance column.
--     A mutable balance is how you get race conditions and an unauditable
--     billing system. Balance is always SUM(delta) over unexpired rows.
--   * Every user-owned table has RLS keyed on user_id. The service role
--     bypasses RLS and is what our Route Handlers use for writes that need
--     to span tables.

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles are readable by their owner"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles are updatable by their owner"
  on public.profiles for update
  using (auth.uid() = id);

-- Create a profile row whenever a new auth user appears.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  );

  -- Starter credits. Inert until billing ships, but granting from day one
  -- means the ledger has a complete history for every account.
  insert into public.credit_ledger (user_id, delta, reason, expires_at)
  values (new.id, 3000, 'starter_grant', now() + interval '12 months');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- connections — third-party OAuth tokens
-- ---------------------------------------------------------------------------

create type public.provider as enum ('spotify', 'lastfm', 'youtube', 'reddit');

create table public.connections (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  provider      public.provider not null,
  access_token  text not null,
  refresh_token text,
  expires_at    timestamptz,
  scopes        text[],
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, provider)
);

alter table public.connections enable row level security;

-- Deliberately no SELECT policy for the anon/authenticated roles. Tokens are
-- read exclusively server-side via the service role. If you ever find yourself
-- adding a select policy here, stop and reconsider — it means a token is about
-- to reach the browser.

-- ---------------------------------------------------------------------------
-- conversions
-- ---------------------------------------------------------------------------

create type public.conversion_status as enum (
  'draft', 'searching', 'reviewing', 'creating', 'completed', 'failed'
);

create table public.conversions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  source_type    text not null,               -- SourceAdapter.id
  dest_type      text not null,               -- 'spotify' | 'export'
  status         public.conversion_status not null default 'draft',
  playlist_id    text,                        -- Spotify playlist id, once created
  playlist_name  text,
  total_parsed   integer not null default 0,
  total_matched  integer not null default 0,
  total_added    integer not null default 0,
  error          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.conversions enable row level security;

create policy "conversions are readable by their owner"
  on public.conversions for select
  using (auth.uid() = user_id);

create policy "conversions are insertable by their owner"
  on public.conversions for insert
  with check (auth.uid() = user_id);

create policy "conversions are updatable by their owner"
  on public.conversions for update
  using (auth.uid() = user_id);

create index conversions_user_created_idx
  on public.conversions (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- conversion_tracks
-- ---------------------------------------------------------------------------

create table public.conversion_tracks (
  id             uuid primary key default gen_random_uuid(),
  conversion_id  uuid not null references public.conversions (id) on delete cascade,
  position       integer not null,
  raw_input      text not null,               -- the original line, for the review UI
  parsed_artist  text,
  parsed_title   text,
  matched_uri    text,                        -- spotify:track:...
  matched_name   text,
  matched_artist text,
  confidence     numeric(4, 3),               -- 0.000 - 1.000
  accepted       boolean not null default false,
  created_at     timestamptz not null default now()
);

alter table public.conversion_tracks enable row level security;

create policy "conversion tracks are readable by the conversion owner"
  on public.conversion_tracks for select
  using (
    exists (
      select 1 from public.conversions c
      where c.id = conversion_id and c.user_id = auth.uid()
    )
  );

create index conversion_tracks_conversion_idx
  on public.conversion_tracks (conversion_id, position);

-- ---------------------------------------------------------------------------
-- credit_ledger — append only
-- ---------------------------------------------------------------------------

create table public.credit_ledger (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  delta      integer not null,          -- positive = grant, negative = spend
  reason     text not null,             -- 'starter_grant' | 'purchase' | 'playlist_add' | 'refund'
  ref_id     uuid,                      -- conversion or purchase this relates to
  expires_at timestamptz,               -- null = never expires (spends)
  created_at timestamptz not null default now()
);

alter table public.credit_ledger enable row level security;

create policy "ledger entries are readable by their owner"
  on public.credit_ledger for select
  using (auth.uid() = user_id);

-- No insert/update/delete policies: only the service role writes to the ledger.

create index credit_ledger_user_idx
  on public.credit_ledger (user_id, created_at desc);

-- Current balance for a user: grants that have not expired, minus all spends.
create function public.credit_balance(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    sum(delta) filter (where delta < 0 or expires_at is null or expires_at > now()),
    0
  )::integer
  from public.credit_ledger
  where user_id = p_user_id;
$$;

-- ---------------------------------------------------------------------------
-- purchases — created now, unused until Stripe lands (Phase 6)
-- ---------------------------------------------------------------------------

create table public.purchases (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references auth.users (id) on delete cascade,
  stripe_payment_intent_id text unique,
  amount_cents             integer not null,
  currency                 text not null default 'usd',
  credits_granted          integer not null,
  created_at               timestamptz not null default now()
);

alter table public.purchases enable row level security;

create policy "purchases are readable by their owner"
  on public.purchases for select
  using (auth.uid() = user_id);
