-- location_source: provenance of a note's coordinates.
--   'exif'     — photo EXIF GPS (trusted: the photo was there)
--   'gps'      — device GPS, judged plausible for the trip
--   'inferred' — device GPS rejected; location substituted from the trip anchor
--   'manual'   — typed by the user (capture or edit sheet)
--   null       — legacy rows and notes with no location
alter table public.notes
  add column location_source text
  check (location_source in ('gps', 'exif', 'manual', 'inferred'));
