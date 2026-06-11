import { supabase } from '../lib/supabase';
import { geocodeLocation } from './locationService';
import type { AnchorPoint } from './tripAnchorHelpers';

/**
 * Anchors for a trip: geocoded `trips.destinations` entries plus the
 * coordinates of trusted notes (`location_source` 'exif' or 'manual'). Non-trusted
 * ('gps'/null) notes are deliberately excluded — otherwise an existing wrong-location
 * note would vouch for future wrong GPS fixes.
 *
 * Non-empty results are memoized per trip for the app session. Empty results
 * are NOT cached: they usually mean offline geocoding, and the next call
 * should retry.
 */
const cache = new Map<string, AnchorPoint[]>();

export function clearAnchorCache(): void {
  cache.clear();
}

export async function getTripAnchors(tripId: string): Promise<AnchorPoint[]> {
  const cached = cache.get(tripId);
  if (cached) return cached;

  const anchors: AnchorPoint[] = [];

  const { data: trip } = await supabase
    .from('trips')
    .select('destinations')
    .eq('id', tripId)
    .single();

  for (const destination of trip?.destinations ?? []) {
    const hit = await geocodeLocation(destination);
    if (hit) anchors.push(hit);
  }

  const { data: trusted } = await supabase
    .from('notes')
    .select('lat, lng')
    .eq('trip_id', tripId)
    .in('location_source', ['exif', 'manual'])
    .not('lat', 'is', null)
    .not('lng', 'is', null);

  for (const note of trusted ?? []) {
    if (note.lat !== null && note.lng !== null) {
      anchors.push({ lat: note.lat, lng: note.lng });
    }
  }

  if (anchors.length > 0) cache.set(tripId, anchors);
  return anchors;
}
