import type { Database } from '../lib/database.types';
import type { Category } from './noteHelpers';
import { CATEGORIES } from './noteHelpers';

type PublicPlaceRow = Database['public']['Tables']['public_places']['Row'];

// public_places row, with dominant_category narrowed to the Category union.
export type PublicPlace = Omit<PublicPlaceRow, 'dominant_category'> & {
  dominant_category: Category | null;
};

export type Destination = {
  city: string;
  place_count: number;
  total_visits: number;
  categories: Category[];
};

// avg_rating is derived (Spec A stores rating_sum + rating_count, not the average).
export function avgRating(ratingSum: number, ratingCount: number): number | null {
  if (ratingCount <= 0) return null;
  return ratingSum / ratingCount;
}

// Most-visited first; among equal visits, higher average rating first (unrated last).
// JS Array.prototype.sort is stable, so equal elements keep their input order.
export function rankPlaces(places: PublicPlace[]): PublicPlace[] {
  return [...places].sort((a, b) => {
    if (b.visit_count !== a.visit_count) return b.visit_count - a.visit_count;
    const av = avgRating(a.rating_sum, a.rating_count) ?? -1;
    const bv = avgRating(b.rating_sum, b.rating_count) ?? -1;
    return bv - av;
  });
}

// Distinct dominant categories among the places, in canonical CATEGORIES order.
export function categoriesPresent(places: PublicPlace[]): Category[] {
  const seen = new Set<Category>();
  for (const p of places) {
    if (p.dominant_category) seen.add(p.dominant_category);
  }
  return CATEGORIES.filter((c) => seen.has(c));
}
