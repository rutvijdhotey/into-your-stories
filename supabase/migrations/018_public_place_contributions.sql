-- public_place_contributions: PRIVATE idempotency ledger. One row per note that
-- has contributed to a public place. The unique note_id guarantees a note is
-- counted at most once across trip re-completions. Never publicly readable — it
-- links user-owned notes to public places. Only the SECURITY DEFINER aggregate
-- function (migration 021) touches it.
create table public.public_place_contributions (
  id uuid primary key default gen_random_uuid(),
  public_place_id uuid not null references public.public_places (id) on delete cascade,
  -- unique = the idempotency guard. on delete cascade: if a note is deleted its
  -- ledger row goes too, but public_places counts are NOT decremented (add-only V1).
  note_id uuid not null unique references public.notes (id) on delete cascade,
  trip_id uuid not null references public.trips (id) on delete cascade,
  rating smallint check (rating is null or rating between 1 and 5),
  category text,
  created_at timestamptz not null default now()
);

create index public_place_contributions_place_idx
  on public.public_place_contributions (public_place_id);

-- RLS on, INTENTIONALLY no policies: fully locked to anon/authenticated. The
-- SECURITY DEFINER aggregate function (runs as table owner) bypasses RLS.
alter table public.public_place_contributions enable row level security;
