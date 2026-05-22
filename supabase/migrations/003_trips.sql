-- trips: the core organizing unit. Everything else (notes, places, blog posts)
-- will reference trips in later phases. Multiple active trips per user allowed.

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  destinations text[] not null default '{}'::text[],
  start_date date,
  end_date date,
  status text not null default 'active'
    check (status in ('active', 'completed')),
  cover_photo_url text,
  note_count integer not null default 0 check (note_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trips_date_order check (
    start_date is null or end_date is null or start_date <= end_date
  )
);

create index trips_user_status_created_idx
  on public.trips (user_id, status, created_at desc);

-- updated_at maintained by trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Lock down the set_updated_at function (same reasoning as handle_new_user
-- in migration 002a — trigger functions don't need REST exposure).
revoke execute on function public.set_updated_at() from public;
revoke execute on function public.set_updated_at() from anon;
revoke execute on function public.set_updated_at() from authenticated;

create trigger trips_set_updated_at
  before update on public.trips
  for each row execute function public.set_updated_at();

-- RLS: trips are fully private to their owner.
alter table public.trips enable row level security;

create policy "trips_select_own"
  on public.trips
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "trips_insert_own"
  on public.trips
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "trips_update_own"
  on public.trips
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "trips_delete_own"
  on public.trips
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- Enable realtime on trips so the Home screen reacts to inserts/updates/deletes
-- without a manual refresh. Note: the supabase_realtime publication exists by
-- default on Supabase-hosted projects.
alter publication supabase_realtime add table public.trips;
