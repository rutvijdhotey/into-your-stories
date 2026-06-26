-- One-time backfill of the community aggregate for already-completed trips.
--
-- Two gaps left places out of public_places:
--   1. Trips completed BEFORE the aggregation trigger (migration 021) shipped
--      never fired the active->completed event, so none of their places were
--      aggregated.
--   2. Notes whose place_name is filled asynchronously by `tag-note` AFTER the
--      trip was completed were ineligible (null place_name) at trigger time and
--      were skipped; nothing re-ran once tagging finished.
--
-- aggregate_trip_for_community is idempotent and add-only — it skips any note
-- already in public_place_contributions and respects the owner's opt-out — so
-- re-running it for every completed trip backfills all missing eligible places
-- with zero risk of double-counting.
do $$
declare
  t record;
begin
  for t in select id from public.trips where status = 'completed' loop
    perform public.aggregate_trip_for_community(t.id);
  end loop;
end $$;
