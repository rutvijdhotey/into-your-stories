-- public_places: anonymized, public-read aggregate of visited places.
-- Holds NO user_id, NO visit timestamps, NO note prose — only place identity,
-- averaged coordinates, popularity + rating counts, and a category tally.
-- Written ONLY by the SECURITY DEFINER aggregate function (migration 021);
-- clients can read but never write.
create table public.public_places (
  id uuid primary key default gen_random_uuid(),

  -- dedupe identity: normalize(place_name) || '|' || normalize(coalesce(city,''))
  place_key text not null unique,
  place_name text not null,
  city text,

  -- running-average coordinates (null until a contribution carries coords)
  lat double precision,
  lng double precision,
  coord_count integer not null default 0 check (coord_count >= 0),

  visit_count integer not null default 0 check (visit_count >= 0),
  rating_sum integer not null default 0 check (rating_sum >= 0),
  rating_count integer not null default 0 check (rating_count >= 0),

  -- per-category tally, e.g. {"food":3,"activity":1}; dominant_category derived from it
  category_counts jsonb not null default '{}'::jsonb,
  dominant_category text
    check (dominant_category is null
           or dominant_category in ('food','stay','activity','shopping')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Explore reads sort by popularity and filter by city.
create index public_places_visit_count_idx on public.public_places (visit_count desc);
create index public_places_city_idx on public.public_places (city);

-- reuse the hardened set_updated_at function (defined in migration 003)
create trigger public_places_set_updated_at
  before update on public.public_places
  for each row execute function public.set_updated_at();

-- RLS: public read for everyone (incl. anon). NO write policies — only the
-- SECURITY DEFINER aggregate function (runs as table owner, bypassing RLS) writes.
alter table public.public_places enable row level security;

create policy "public_places_select_all"
  on public.public_places
  for select
  using (true);
