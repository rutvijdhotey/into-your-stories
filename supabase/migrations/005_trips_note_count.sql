-- Keep public.trips.note_count in sync with public.notes via row-level triggers.
-- The note_count column exists since Migration 003 but has never been touched.
-- Maintaining it in-db keeps TripCard / Home accurate without a count query per render.

create or replace function public.bump_trip_note_count()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT') then
    update public.trips
      set note_count = note_count + 1
      where id = new.trip_id;
    return new;
  elsif (tg_op = 'DELETE') then
    update public.trips
      set note_count = greatest(0, note_count - 1)
      where id = old.trip_id;
    return old;
  end if;
  return null;
end;
$$;

revoke execute on function public.bump_trip_note_count() from public;
revoke execute on function public.bump_trip_note_count() from anon;
revoke execute on function public.bump_trip_note_count() from authenticated;

create trigger notes_bump_count_insert
  after insert on public.notes
  for each row execute function public.bump_trip_note_count();

create trigger notes_bump_count_delete
  after delete on public.notes
  for each row execute function public.bump_trip_note_count();
