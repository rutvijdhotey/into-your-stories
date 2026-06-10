-- occurred_at: the moment the experience happened, derived from photo EXIF
-- DateTimeOriginal. Null when no photos have EXIF or note has no photos.
-- Feed sorts by this when present, falling back to captured_at.
alter table public.notes
  add column occurred_at timestamptz;

-- Index so ORDER BY COALESCE(occurred_at, captured_at) DESC is fast per-trip.
create index notes_trip_occurred_idx
  on public.notes (trip_id, occurred_at desc nulls last);
