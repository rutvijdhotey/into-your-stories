-- Moving a note between trips: keep trips.note_count correct and tighten RLS.
--
-- 005_trips_note_count.sql maintained note_count only on INSERT/DELETE. An
-- UPDATE that changes notes.trip_id (a "move") adjusted neither trip's count.
-- Here we add an UPDATE branch (guarded so all other note edits are no-ops),
-- and we tighten the notes UPDATE policy so a note can only be moved onto a
-- trip the user owns (the INSERT policy already enforced this; UPDATE did not).

-- 1. Extend the counter function with an UPDATE branch.
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
  elsif (tg_op = 'UPDATE') then
    if (new.trip_id is distinct from old.trip_id) then
      update public.trips
        set note_count = greatest(0, note_count - 1)
        where id = old.trip_id;
      update public.trips
        set note_count = note_count + 1
        where id = new.trip_id;
    end if;
    return new;
  end if;
  return null;
end;
$$;

revoke execute on function public.bump_trip_note_count() from public;
revoke execute on function public.bump_trip_note_count() from anon;
revoke execute on function public.bump_trip_note_count() from authenticated;

-- 2. Fire the function on UPDATE too. The `is distinct from` guard inside the
--    function makes this a cheap no-op for content/location/tagging edits.
drop trigger if exists notes_bump_count_update on public.notes;
create trigger notes_bump_count_update
  after update on public.notes
  for each row execute function public.bump_trip_note_count();

-- 3. Tighten the notes UPDATE policy: the target trip must belong to the user.
--    Mirrors the INSERT policy's WITH CHECK; closes a cross-trip move hole.
drop policy if exists "notes_update_own" on public.notes;
create policy "notes_update_own"
  on public.notes
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.trips t
      where t.id = trip_id and t.user_id = auth.uid()
    )
  );
