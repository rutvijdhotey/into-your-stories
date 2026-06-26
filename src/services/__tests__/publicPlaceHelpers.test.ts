import {
  avgRating,
  rankPlaces,
  categoriesPresent,
  type PublicPlace,
} from '../publicPlaceHelpers';

function place(p: Partial<PublicPlace>): PublicPlace {
  return {
    id: p.id ?? 'p',
    place_key: p.place_key ?? 'k',
    place_name: p.place_name ?? 'Place',
    city: p.city ?? 'City',
    lat: p.lat ?? null,
    lng: p.lng ?? null,
    coord_count: p.coord_count ?? 0,
    visit_count: p.visit_count ?? 0,
    rating_sum: p.rating_sum ?? 0,
    rating_count: p.rating_count ?? 0,
    category_counts: p.category_counts ?? {},
    dominant_category: p.dominant_category ?? null,
    created_at: p.created_at ?? '2026-01-01T00:00:00Z',
    updated_at: p.updated_at ?? '2026-01-01T00:00:00Z',
  };
}

describe('avgRating', () => {
  it('returns null when there are no ratings', () => {
    expect(avgRating(0, 0)).toBeNull();
  });
  it('returns the average when there are ratings', () => {
    expect(avgRating(9, 2)).toBe(4.5);
  });
});

describe('rankPlaces', () => {
  it('orders by visit_count desc, then avg_rating desc, nulls last', () => {
    const a = place({ id: 'a', visit_count: 5, rating_sum: 8, rating_count: 2 }); // avg 4
    const b = place({ id: 'b', visit_count: 5, rating_sum: 5, rating_count: 1 }); // avg 5
    const c = place({ id: 'c', visit_count: 5, rating_sum: 0, rating_count: 0 }); // avg null
    const d = place({ id: 'd', visit_count: 9 });
    expect(rankPlaces([a, b, c, d]).map((p) => p.id)).toEqual(['d', 'b', 'a', 'c']);
  });
  it('does not mutate the input array', () => {
    const arr = [place({ id: 'a', visit_count: 1 }), place({ id: 'b', visit_count: 2 })];
    rankPlaces(arr);
    expect(arr.map((p) => p.id)).toEqual(['a', 'b']);
  });
});

describe('categoriesPresent', () => {
  it('returns distinct dominant categories in CATEGORIES order', () => {
    const places = [
      place({ dominant_category: 'activity' }),
      place({ dominant_category: 'food' }),
      place({ dominant_category: 'food' }),
      place({ dominant_category: null }),
    ];
    expect(categoriesPresent(places)).toEqual(['food', 'activity']);
  });
});
