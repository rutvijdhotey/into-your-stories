-- Closes the forward-going gap left by migration 023's one-time backfill:
-- `tag-note` fills place_name/category asynchronously, so a note can become
-- eligible (or change eligible fields) AFTER its trip already completed and
-- the trip-completion trigger (021) already ran. Without this, such a note
-- would never reach public_places until another manual backfill.
--
-- aggregate_trip_for_community is idempotent and add-only (skips notes
-- already in public_place_contributions), so re-running it on every relevant
-- notes UPDATE is safe. Gated to only fire when an eligibility-affecting
-- field actually changed, and only re-aggregates if the note's trip is
-- already completed (the 021 trigger already covers the active->completed
-- transition itself).
create or replace function public.notes_community_aggregate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip_status text;
begin
  if new.place_name is not distinct from old.place_name
     and new.category is not distinct from old.category
     and new.rating is not distinct from old.rating then
    return new;
  end if;

  select status into v_trip_status from public.trips where id = new.trip_id;
  if v_trip_status = 'completed' then
    perform public.aggregate_trip_for_community(new.trip_id);
  end if;

  return new;
end;
$$;

revoke execute on function public.notes_community_aggregate() from public, anon, authenticated;

create trigger notes_community_aggregate
  after update on public.notes
  for each row
  execute function public.notes_community_aggregate();
