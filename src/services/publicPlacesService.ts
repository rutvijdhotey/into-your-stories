import { supabase } from '../lib/supabase';
import type { Category } from './noteHelpers';
import type { Destination, PublicPlace } from './publicPlaceHelpers';

// Cities ranked by total community visits (drives the Explore grid).
export async function listDestinations(): Promise<Destination[]> {
  const { data, error } = await supabase
    .from('public_destinations')
    .select('*')
    .order('total_visits', { ascending: false });
  if (error) throw error;
  // View columns type as nullable; the view filters out null cities, so coalesce defensively.
  return (data ?? []).map((d) => ({
    city: d.city ?? '',
    place_count: d.place_count ?? 0,
    total_visits: d.total_visits ?? 0,
    categories: (d.categories ?? []) as Category[],
  }));
}

// All public places in a city (ranking applied by the caller via rankPlaces).
export async function listPlacesByCity(city: string): Promise<PublicPlace[]> {
  const { data, error } = await supabase
    .from('public_places')
    .select('*')
    .eq('city', city);
  if (error) throw error;
  return (data ?? []) as PublicPlace[];
}
