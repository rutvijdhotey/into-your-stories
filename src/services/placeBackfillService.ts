import { supabase } from '../lib/supabase';
import { reverseGeocodePlace } from './locationService';

const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 500;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type BackfillCandidate = {
  id: string;
  lat: number | null;
  lng: number | null;
  city: string | null;
};

/**
 * Resolves a real `place_name` for the current user's notes that have
 * coordinates but no place_name yet (e.g. notes created before place
 * resolution was added). Processes in small batches with a short delay
 * between batches. Safe to call on every app launch — already-backfilled
 * notes no longer match the query, and notes that fail to resolve (offline,
 * no geocode result) are simply retried on the next launch.
 *
 * Returns the number of notes successfully updated.
 */
export async function backfillPlaceNames(userId: string): Promise<number> {
  const { data, error } = await supabase
    .from('notes')
    .select('id, lat, lng, city')
    .eq('user_id', userId)
    .is('place_name', null)
    .not('lat', 'is', null)
    .not('lng', 'is', null);

  if (error || !data) return 0;

  const candidates = data as BackfillCandidate[];
  let updated = 0;

  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE);
    for (const note of batch) {
      if (note.lat === null || note.lng === null) continue;
      const { city, placeName } = await reverseGeocodePlace(note.lat, note.lng);
      if (!placeName) continue;

      const { error: updateError } = await supabase
        .from('notes')
        .update({ place_name: placeName, city: note.city ?? city })
        .eq('id', note.id);

      if (!updateError) updated += 1;
    }
    if (i + BATCH_SIZE < candidates.length) await delay(BATCH_DELAY_MS);
  }

  return updated;
}
