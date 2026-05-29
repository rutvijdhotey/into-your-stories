-- Realtime DELETE events only carry the table's REPLICA IDENTITY columns. With the
-- default (primary key only), a DELETE payload contains just `id`, so client
-- subscriptions filtered on `user_id` (useTrips, useBlogPosts) never match the
-- filter for deletes and the removed row lingers in the list. REPLICA IDENTITY FULL
-- puts the full old row in the WAL, so filtered DELETE events are delivered.
--
-- Fixes:
--   - deleted trip still appearing in the note-capture trip picker
--   - discarded blog draft still appearing in the Blog tab
alter table public.blog_posts replica identity full;
alter table public.trips replica identity full;
alter table public.notes replica identity full;
