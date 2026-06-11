import { supabase } from '../lib/supabase';
import { reverseGeocodePlace } from './locationService';
import { getTripAnchors } from './tripAnchorService';
import { isPlausible, nearestAnchor } from './tripAnchorHelpers';

const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 500;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type SweepCandidate = {
  id: string;
  lat: number | null;
  lng: number | null;
  location_source: string | null;
};

/**
 * Corrects existing notes whose device-GPS location is implausible for their
 * trip (e.g. "Mountain View" on a Paris trip). Only 'gps' and null-source
 * (legacy) notes are candidates — 'exif' and 'manual' are never touched.
 * Outliers are rewritten to the nearest trip anchor; plausible legacy notes
 * are upgraded to 'gps' so they leave the candidate set. Safe to run on every
 * launch — idempotent and resumable, like backfillPlaceNames. Run BEFORE the
 * place-name backfill so we never geocode coordinates about to be rewritten.
 *
 * Returns the number of notes corrected (upgrades don't count).
 */
export async function sweepNoteLocations(userId: string): Promise<number> {
  const { data: trips, error } = await supabase
    .from('trips')
    .select('id')
    .eq('user_id', userId);

  if (error || !trips) return 0;

  let corrected = 0;

  for (const trip of trips) {
    const anchors = await getTripAnchors(trip.id);
    if (anchors.length === 0) continue; // no judgment possible for this trip

    const { data, error: notesError } = await supabase
      .from('notes')
      .select('id, lat, lng, location_source')
      .eq('trip_id', trip.id)
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .or('location_source.eq.gps,location_source.is.null');

    if (notesError || !data) continue;
    const candidates = data as SweepCandidate[];

    for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
      for (const note of candidates.slice(i, i + BATCH_SIZE)) {
        if (note.lat === null || note.lng === null) continue;
        const point = { lat: note.lat, lng: note.lng };

        if (isPlausible(point, anchors)) {
          if (note.location_source === null) {
            await supabase.from('notes').update({ location_source: 'gps' }).eq('id', note.id);
          }
          continue;
        }

        const anchor = nearestAnchor(point, anchors);
        if (!anchor) continue;
        const { city, placeName } = await reverseGeocodePlace(anchor.lat, anchor.lng);
        const { error: updateError } = await supabase
          .from('notes')
          .update({
            lat: anchor.lat,
            lng: anchor.lng,
            city,
            place_name: placeName,
            location_source: 'inferred',
          })
          .eq('id', note.id);

        if (!updateError) corrected += 1;
      }
      if (i + BATCH_SIZE < candidates.length) await delay(BATCH_DELAY_MS);
    }
  }

  return corrected;
}
