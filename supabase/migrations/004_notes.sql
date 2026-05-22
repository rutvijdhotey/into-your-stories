-- notes: the primary content unit captured during a trip.
-- Phase 3 saves text-only notes; photo + voice fields land in later phases.
-- AI fields (place_name, embeddings) populated in Phase 6 + 8.

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  trip_id uuid not null references public.trips (id) on delete cascade,

  -- content
  content text not null check (char_length(content) between 1 and 8000),
  category text
    check (category is null or category in
      ('food','stay','activity','shopping','to-visit','general')),

  -- location captured at save time (null if permission denied or GPS unavailable)
  lat double precision,
  lng double precision,
  city text,

  -- AI fields (populated in later phases)
  place_name text,
  tagging_status text not null default 'pending'
    check (tagging_status in ('pending','complete','failed')),

  -- offline sync — client generates this UUID before insert. Unique constraint
  -- lets the queue retry with upsert(onConflict: 'offline_id', ignoreDuplicates).
  offline_id uuid not null unique,

  -- timestamps
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Feed query: notes for a trip, newest first.
create index notes_trip_captured_idx
  on public.notes (trip_id, captured_at desc);

-- updated_at trigger reuses the already-hardened set_updated_at function.
create trigger notes_set_updated_at
  before update on public.notes
  for each row execute function public.set_updated_at();

-- RLS: notes are fully private to their owner AND must belong to one of the
-- owner's own trips. The trip ownership check stops a malicious client from
-- attaching a note to someone else's trip while still passing auth.uid().
alter table public.notes enable row level security;

create policy "notes_select_own"
  on public.notes
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "notes_insert_own"
  on public.notes
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.trips t
      where t.id = trip_id and t.user_id = auth.uid()
    )
  );

create policy "notes_update_own"
  on public.notes
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "notes_delete_own"
  on public.notes
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- Realtime so the feed updates instantly on queue drain or multi-device save.
alter publication supabase_realtime add table public.notes;
