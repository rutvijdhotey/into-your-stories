# Explore UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the placeholder Explore tab into a real community-discovery surface — a popularity-sorted grid of city destinations, each opening a community map + ranked list of places — reading the anonymized `public_places` aggregate from Spec A.

**Architecture:** A `public_destinations` SQL view aggregates `public_places` per city. A thin `publicPlacesService` reads the view + per-city places; pure helpers (`publicPlaceHelpers`) own ranking, average-rating derivation, and category extraction. `ExploreScreen` renders a 2-column grid of `DestinationCard`s; a new `DestinationScreen` renders a `react-native-maps` map (reusing `mapHelpers`) + category filter chips + a ranked list of `PublicPlaceRow`s. No imagery, no realtime, no search.

**Tech Stack:** React Native (Expo), `react-native-maps`, Supabase (Postgres view + PostgREST), Supabase MCP (`apply_migration`, `generate_typescript_types`) against project **`dcejrbyujfcxartywpis`**. Tests: `npx jest` (`@testing-library/react-native` for components), types: `npx tsc --noEmit`.

## Spec

`docs/superpowers/specs/2026-06-25-explore-ui-design.md`

## Conventions

- Services follow `src/services/tripService.ts`: `import { supabase } from '../lib/supabase'`, `.from(...).select('*')`, `if (error) throw error`, return `(data ?? []) as T`.
- Service tests mock `../../lib/supabase` with a query-builder mock (see `src/services/__tests__/tripService.test.ts`).
- Component render tests use `@testing-library/react-native` (see `src/components/__tests__/TripCard.render.test.tsx`).
- Theme tokens from `src/theme` (`Colors`, `Spacing`, `Typography`, `BorderRadius`, `CategoryColors`).
- Migration applied via Supabase MCP `apply_migration({ project_id: 'dcejrbyujfcxartywpis', name, query })`, the `.sql` file committed (matches 001–021).

## File Structure

- Create `supabase/migrations/022_public_destinations_view.sql` — the per-city aggregate view.
- Create `src/services/publicPlaceHelpers.ts` — `Destination` + `PublicPlace` types, `avgRating`, `rankPlaces`, `categoriesPresent` (pure, no RN imports).
- Create `src/services/__tests__/publicPlaceHelpers.test.ts`.
- Create `src/services/publicPlacesService.ts` — `listDestinations`, `listPlacesByCity`.
- Create `src/services/__tests__/publicPlacesService.test.ts`.
- Create `src/components/DestinationCard.tsx` + `src/components/__tests__/DestinationCard.render.test.tsx`.
- Create `src/components/PublicPlaceRow.tsx` + `src/components/__tests__/PublicPlaceRow.render.test.tsx`.
- Create `src/screens/DestinationScreen.tsx`.
- Modify `src/navigation/types.ts` — add `Destination: { city: string }` to `MainStackParamList`.
- Modify `src/navigation/MainStack.tsx` — register the `Destination` route.
- Modify `src/screens/ExploreScreen.tsx` — rewrite as the destination grid.
- Modify `src/lib/database.types.ts` — regenerated (Task 1).

---

### Task 1: `public_destinations` view + regenerated types

**Files:**
- Create: `supabase/migrations/022_public_destinations_view.sql`
- Modify: `src/lib/database.types.ts`

- [ ] **Step 1: Write the failing test**

Run via Supabase MCP `execute_sql` (project_id `dcejrbyujfcxartywpis`). If the tool schema isn't loaded, use ToolSearch query `select:mcp__7fbbe81e-73f2-44e8-81b3-e04e19180276__execute_sql,mcp__7fbbe81e-73f2-44e8-81b3-e04e19180276__apply_migration,mcp__7fbbe81e-73f2-44e8-81b3-e04e19180276__generate_typescript_types`.

```sql
select city, place_count, total_visits, categories from public.public_destinations limit 1;
```

- [ ] **Step 2: Run it to verify it fails**

Expected: error `relation "public.public_destinations" does not exist`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/022_public_destinations_view.sql`:

```sql
-- One row per city: place count, total community visits, and the distinct
-- categories present (for the Explore card's color dots). Drives the Explore
-- grid. security_invoker so it honors public_places' public-read RLS.
create view public.public_destinations
  with (security_invoker = on) as
select city,
       count(*)::int          as place_count,
       sum(visit_count)::int   as total_visits,
       coalesce(
         array_agg(distinct dominant_category)
           filter (where dominant_category is not null),
         '{}'
       )                       as categories
from public.public_places
where city is not null
group by city;
```

- [ ] **Step 4: Apply and verify it passes**

Apply via `apply_migration({ project_id: 'dcejrbyujfcxartywpis', name: '022_public_destinations_view', query: <file contents> })`.
Re-run the Step 1 query via `execute_sql`. Expected: succeeds (0 rows is fine — the table may be empty on the dev DB).

- [ ] **Step 5: Regenerate types**

Call `generate_typescript_types({ project_id: 'dcejrbyujfcxartywpis' })` and overwrite `src/lib/database.types.ts` with the result. Confirm it now contains a `public_destinations` entry under `public.Views` with columns `city`, `place_count`, `total_visits`, `categories`.

- [ ] **Step 6: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/022_public_destinations_view.sql src/lib/database.types.ts
git commit -m "feat(db): public_destinations view for the Explore grid"
```

---

### Task 2: Pure helpers (`publicPlaceHelpers`)

**Files:**
- Create: `src/services/publicPlaceHelpers.ts`
- Test: `src/services/__tests__/publicPlaceHelpers.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/services/__tests__/publicPlaceHelpers.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest publicPlaceHelpers -t avgRating`
Expected: FAIL — cannot find module `../publicPlaceHelpers`.

- [ ] **Step 3: Write the implementation**

Create `src/services/publicPlaceHelpers.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest publicPlaceHelpers`
Expected: PASS (all describe blocks).

- [ ] **Step 5: Commit**

```bash
git add src/services/publicPlaceHelpers.ts src/services/__tests__/publicPlaceHelpers.test.ts
git commit -m "feat: publicPlaceHelpers (avgRating, rankPlaces, categoriesPresent)"
```

---

### Task 3: Service (`publicPlacesService`)

**Files:**
- Create: `src/services/publicPlacesService.ts`
- Test: `src/services/__tests__/publicPlacesService.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/services/__tests__/publicPlacesService.test.ts`:

```ts
// Supabase query-builder mocks.
const mockOrder = jest.fn();
const mockEq = jest.fn();
const mockSelect = jest.fn();
const mockFrom = jest.fn();

jest.mock('../../lib/supabase', () => ({
  supabase: { from: (table: string) => mockFrom(table) },
}));

import { listDestinations, listPlacesByCity } from '../publicPlacesService';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('listDestinations', () => {
  it('reads the view ordered by total_visits desc and maps rows', async () => {
    mockOrder.mockResolvedValueOnce({
      data: [{ city: 'Paris', place_count: 3, total_visits: 7, categories: ['food'] }],
      error: null,
    });
    mockSelect.mockReturnValueOnce({ order: mockOrder });
    mockFrom.mockReturnValueOnce({ select: mockSelect });

    const result = await listDestinations();

    expect(mockFrom).toHaveBeenCalledWith('public_destinations');
    expect(mockSelect).toHaveBeenCalledWith('*');
    expect(mockOrder).toHaveBeenCalledWith('total_visits', { ascending: false });
    expect(result).toEqual([
      { city: 'Paris', place_count: 3, total_visits: 7, categories: ['food'] },
    ]);
  });

  it('throws when supabase errors', async () => {
    mockOrder.mockResolvedValueOnce({ data: null, error: new Error('boom') });
    mockSelect.mockReturnValueOnce({ order: mockOrder });
    mockFrom.mockReturnValueOnce({ select: mockSelect });
    await expect(listDestinations()).rejects.toThrow('boom');
  });
});

describe('listPlacesByCity', () => {
  it('reads public_places filtered by city', async () => {
    mockEq.mockResolvedValueOnce({
      data: [{ id: 'p1', place_name: 'Cafe', city: 'Paris', visit_count: 2 }],
      error: null,
    });
    mockSelect.mockReturnValueOnce({ eq: mockEq });
    mockFrom.mockReturnValueOnce({ select: mockSelect });

    const result = await listPlacesByCity('Paris');

    expect(mockFrom).toHaveBeenCalledWith('public_places');
    expect(mockSelect).toHaveBeenCalledWith('*');
    expect(mockEq).toHaveBeenCalledWith('city', 'Paris');
    expect(result).toHaveLength(1);
    expect(result[0].place_name).toBe('Cafe');
  });

  it('throws when supabase errors', async () => {
    mockEq.mockResolvedValueOnce({ data: null, error: new Error('nope') });
    mockSelect.mockReturnValueOnce({ eq: mockEq });
    mockFrom.mockReturnValueOnce({ select: mockSelect });
    await expect(listPlacesByCity('Paris')).rejects.toThrow('nope');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest publicPlacesService`
Expected: FAIL — cannot find module `../publicPlacesService`.

- [ ] **Step 3: Write the implementation**

Create `src/services/publicPlacesService.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest publicPlacesService`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/publicPlacesService.ts src/services/__tests__/publicPlacesService.test.ts
git commit -m "feat: publicPlacesService (listDestinations, listPlacesByCity)"
```

---

### Task 4: `DestinationCard` component

**Files:**
- Create: `src/components/DestinationCard.tsx`
- Test: `src/components/__tests__/DestinationCard.render.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/__tests__/DestinationCard.render.test.tsx`:

```tsx
import { render, fireEvent } from '@testing-library/react-native';
import DestinationCard from '../DestinationCard';
import type { Destination } from '../../services/publicPlaceHelpers';

const dest: Destination = {
  city: 'Paris',
  place_count: 3,
  total_visits: 7,
  categories: ['food', 'activity'],
};

describe('DestinationCard', () => {
  it('renders city, place count and visit count', () => {
    const { getByText } = render(<DestinationCard destination={dest} onPress={() => {}} />);
    expect(getByText('Paris')).toBeTruthy();
    expect(getByText('3 places · 7 visits')).toBeTruthy();
  });

  it('singularizes one place / one visit', () => {
    const one: Destination = { city: 'Rome', place_count: 1, total_visits: 1, categories: [] };
    const { getByText } = render(<DestinationCard destination={one} onPress={() => {}} />);
    expect(getByText('1 place · 1 visit')).toBeTruthy();
  });

  it('calls onPress when tapped', () => {
    const onPress = jest.fn();
    const { getByText } = render(<DestinationCard destination={dest} onPress={onPress} />);
    fireEvent.press(getByText('Paris'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest DestinationCard`
Expected: FAIL — cannot find module `../DestinationCard`.

- [ ] **Step 3: Write the implementation**

Create `src/components/DestinationCard.tsx`:

```tsx
import { Pressable, View, Text, StyleSheet } from 'react-native';
import { Colors, Spacing, Typography, BorderRadius, CategoryColors, Shadows } from '../theme';
import type { Destination } from '../services/publicPlaceHelpers';

type Props = { destination: Destination; onPress: () => void };

export default function DestinationCard({ destination, onPress }: Props) {
  const { city, place_count, total_visits, categories } = destination;
  const placeLabel = `${place_count} ${place_count === 1 ? 'place' : 'places'}`;
  const visitLabel = `${total_visits} ${total_visits === 1 ? 'visit' : 'visits'}`;
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <Text style={styles.city} numberOfLines={1}>{city}</Text>
      <Text style={styles.meta}>{`${placeLabel} · ${visitLabel}`}</Text>
      <View style={styles.dots}>
        {categories.map((c) => (
          <View
            key={c}
            style={[styles.dot, { backgroundColor: (CategoryColors[c] ?? CategoryColors.general).text }]}
          />
        ))}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minHeight: 110,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.card,
    padding: Spacing.md,
    justifyContent: 'space-between',
    ...Shadows.card,
  },
  city: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  meta: { ...Typography.caption, color: Colors.textSecondary, marginTop: 4 },
  dots: { flexDirection: 'row', gap: 6, marginTop: Spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest DestinationCard`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/DestinationCard.tsx src/components/__tests__/DestinationCard.render.test.tsx
git commit -m "feat: DestinationCard component"
```

---

### Task 5: `PublicPlaceRow` component

**Files:**
- Create: `src/components/PublicPlaceRow.tsx`
- Test: `src/components/__tests__/PublicPlaceRow.render.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/__tests__/PublicPlaceRow.render.test.tsx`:

```tsx
import { render, fireEvent } from '@testing-library/react-native';
import PublicPlaceRow from '../PublicPlaceRow';
import type { PublicPlace } from '../../services/publicPlaceHelpers';

function place(p: Partial<PublicPlace>): PublicPlace {
  return {
    id: 'p', place_key: 'k', place_name: 'Tartine', city: 'SF',
    lat: null, lng: null, coord_count: 0,
    visit_count: 4, rating_sum: 0, rating_count: 0,
    category_counts: {}, dominant_category: 'food',
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    ...p,
  };
}

describe('PublicPlaceRow', () => {
  it('renders name and visit count', () => {
    const { getByText } = render(<PublicPlaceRow place={place({})} onPress={() => {}} />);
    expect(getByText('Tartine')).toBeTruthy();
    expect(getByText('4 visits')).toBeTruthy();
  });

  it('shows the average rating when rated', () => {
    const { getByText } = render(
      <PublicPlaceRow place={place({ rating_sum: 9, rating_count: 2 })} onPress={() => {}} />,
    );
    expect(getByText('★ 4.5')).toBeTruthy();
  });

  it('omits the rating when unrated', () => {
    const { queryByText } = render(<PublicPlaceRow place={place({})} onPress={() => {}} />);
    expect(queryByText(/★/)).toBeNull();
  });

  it('calls onPress when tapped', () => {
    const onPress = jest.fn();
    const { getByText } = render(<PublicPlaceRow place={place({})} onPress={onPress} />);
    fireEvent.press(getByText('Tartine'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest PublicPlaceRow`
Expected: FAIL — cannot find module `../PublicPlaceRow`.

- [ ] **Step 3: Write the implementation**

Create `src/components/PublicPlaceRow.tsx`:

```tsx
import { Pressable, View, Text, StyleSheet } from 'react-native';
import CategoryBadge from './CategoryBadge';
import { avgRating, type PublicPlace } from '../services/publicPlaceHelpers';
import { Colors, Spacing, Typography } from '../theme';

type Props = { place: PublicPlace; onPress: () => void };

export default function PublicPlaceRow({ place, onPress }: Props) {
  const avg = avgRating(place.rating_sum, place.rating_count);
  const visitLabel = `${place.visit_count} ${place.visit_count === 1 ? 'visit' : 'visits'}`;
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={styles.left}>
        <Text style={styles.name} numberOfLines={1}>{place.place_name}</Text>
        <View style={styles.meta}>
          <CategoryBadge category={place.dominant_category} />
          <Text style={styles.visits}>{visitLabel}</Text>
        </View>
      </View>
      {avg != null && <Text style={styles.rating}>{`★ ${avg.toFixed(1)}`}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    gap: Spacing.sm,
  },
  left: { flex: 1, gap: 4 },
  name: { ...Typography.body, fontWeight: '600', color: Colors.textPrimary },
  meta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  visits: { ...Typography.caption, color: Colors.textSecondary },
  rating: { fontSize: 15, fontWeight: '700', color: Colors.accent },
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest PublicPlaceRow`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/PublicPlaceRow.tsx src/components/__tests__/PublicPlaceRow.render.test.tsx
git commit -m "feat: PublicPlaceRow component"
```

---

### Task 6: `DestinationScreen` + route registration

This screen is map-heavy; per the spec it is verified by `tsc` + manual QA (no brittle MapView render test). Reuses `mapHelpers` (`regionForPins`, `pinColor`), which are already unit-tested.

**Files:**
- Create: `src/screens/DestinationScreen.tsx`
- Modify: `src/navigation/types.ts`
- Modify: `src/navigation/MainStack.tsx`

- [ ] **Step 1: Add the route param type**

In `src/navigation/types.ts`, change `MainStackParamList` to add the `Destination` route:

```ts
export type MainStackParamList = {
  Tabs: undefined;
  TripDetail: { tripId: string };
  BlogPost: { postId: string };
  Destination: { city: string };
};
```

- [ ] **Step 2: Create the screen**

Create `src/screens/DestinationScreen.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, ScrollView, Pressable,
} from 'react-native';
import MapView, { Marker, Callout, PROVIDER_DEFAULT } from 'react-native-maps';
import { useRoute, type RouteProp } from '@react-navigation/native';
import type { MainStackParamList } from '../navigation/types';
import { listPlacesByCity } from '../services/publicPlacesService';
import {
  rankPlaces, categoriesPresent, avgRating, type PublicPlace,
} from '../services/publicPlaceHelpers';
import { regionForPins, pinColor } from '../services/mapHelpers';
import { categoryLabel, type Category } from '../services/noteHelpers';
import PublicPlaceRow from '../components/PublicPlaceRow';
import { Colors, Spacing, Typography, CategoryColors, BorderRadius } from '../theme';

type DestinationRoute = RouteProp<MainStackParamList, 'Destination'>;

function hasCoords(p: PublicPlace): p is PublicPlace & { lat: number; lng: number } {
  return p.lat != null && p.lng != null;
}

export default function DestinationScreen() {
  const { params } = useRoute<DestinationRoute>();
  const city = params.city;

  const [places, setPlaces] = useState<PublicPlace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [filter, setFilter] = useState<Category | null>(null);

  const mapRef = useRef<MapView>(null);
  const markerRefs = useRef<Record<string, Marker | null>>({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listPlacesByCity(city)
      .then((rows) => { if (!cancelled) { setPlaces(rows); setError(null); } })
      .catch((e) => { if (!cancelled) setError(e as Error); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [city]);

  const chips = useMemo(() => categoriesPresent(places), [places]);
  const visible = useMemo(
    () => (filter ? places.filter((p) => p.dominant_category === filter) : places),
    [places, filter],
  );
  const ranked = useMemo(() => rankPlaces(visible), [visible]);
  const pins = useMemo(() => visible.filter(hasCoords), [visible]);
  const region = useMemo(
    () => regionForPins(pins.map((p) => ({ lat: p.lat, lng: p.lng }))),
    [pins],
  );

  function focusPlace(p: PublicPlace) {
    if (!hasCoords(p)) return;
    mapRef.current?.animateToRegion(
      { latitude: p.lat, longitude: p.lng, latitudeDelta: 0.02, longitudeDelta: 0.02 },
      350,
    );
    markerRefs.current[p.id]?.showCallout();
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Could not load places: {error.message}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{city}</Text>

      {region && (
        <View style={styles.mapWrap}>
          <MapView
            ref={mapRef}
            style={StyleSheet.absoluteFill}
            provider={PROVIDER_DEFAULT}
            userInterfaceStyle="dark"
            region={region}
          >
            {pins.map((p) => (
              <Marker
                key={p.id}
                ref={(m) => { markerRefs.current[p.id] = m; }}
                coordinate={{ latitude: p.lat, longitude: p.lng }}
                pinColor={pinColor(p.dominant_category)}
              >
                <Callout>
                  <View style={styles.callout}>
                    <Text style={styles.calloutTitle}>{p.place_name}</Text>
                    <Text style={styles.calloutMeta}>
                      {p.visit_count} {p.visit_count === 1 ? 'visit' : 'visits'}
                      {avgRating(p.rating_sum, p.rating_count) != null
                        ? ` · ★ ${avgRating(p.rating_sum, p.rating_count)!.toFixed(1)}`
                        : ''}
                    </Text>
                  </View>
                </Callout>
              </Marker>
            ))}
          </MapView>
        </View>
      )}

      {chips.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipRow}
          contentContainerStyle={styles.chipContent}
        >
          <FilterChip label="All" active={filter === null} onPress={() => setFilter(null)} />
          {chips.map((c) => (
            <FilterChip
              key={c}
              label={categoryLabel(c)}
              active={filter === c}
              color={(CategoryColors[c] ?? CategoryColors.general).text}
              onPress={() => setFilter(c)}
            />
          ))}
        </ScrollView>
      )}

      <ScrollView style={styles.list}>
        {ranked.map((p) => (
          <PublicPlaceRow key={p.id} place={p} onPress={() => focusPlace(p)} />
        ))}
        {ranked.length === 0 && (
          <Text style={styles.empty}>No places to show.</Text>
        )}
      </ScrollView>
    </View>
  );
}

function FilterChip(props: { label: string; active: boolean; color?: string; onPress: () => void }) {
  const { label, active, color, onPress } = props;
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active && { backgroundColor: color ?? Colors.accent, borderColor: color ?? Colors.accent }]}
    >
      <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
  error: { ...Typography.body, color: Colors.error, textAlign: 'center' },
  title: { fontSize: 26, fontWeight: '800', color: Colors.textPrimary, padding: Spacing.md },
  mapWrap: { height: 240, marginHorizontal: Spacing.md, borderRadius: BorderRadius.card, overflow: 'hidden' },
  chipRow: { flexGrow: 0, marginTop: Spacing.sm },
  chipContent: { paddingHorizontal: Spacing.md, gap: Spacing.sm, alignItems: 'center' },
  chip: {
    paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: BorderRadius.pill,
    borderWidth: 1, borderColor: Colors.border,
  },
  chipLabel: { ...Typography.caption, color: Colors.textSecondary },
  chipLabelActive: { color: '#111111', fontWeight: '700' },
  list: { flex: 1, marginTop: Spacing.sm },
  empty: { ...Typography.body, color: Colors.textSecondary, textAlign: 'center', padding: Spacing.lg },
  callout: { maxWidth: 220, padding: Spacing.xs, gap: 4 },
  calloutTitle: { fontSize: 15, fontWeight: '700', color: '#111111' },
  calloutMeta: { fontSize: 13, color: '#333333' },
});
```

- [ ] **Step 3: Register the route in MainStack**

In `src/navigation/MainStack.tsx`, add the import alongside the other screen imports (after line 10, `BlogPostScreen`):

```tsx
import DestinationScreen from '../screens/DestinationScreen';
```

And add the screen inside `<Stack.Navigator>`, after the `BlogPost` screen:

```tsx
        <Stack.Screen
          name="Destination"
          component={DestinationScreen}
          options={{ title: '', headerBackTitle: 'Explore' }}
        />
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/screens/DestinationScreen.tsx src/navigation/types.ts src/navigation/MainStack.tsx
git commit -m "feat: DestinationScreen (community map + ranked places) + route"
```

---

### Task 7: `ExploreScreen` rewrite (destination grid)

**Files:**
- Modify: `src/screens/ExploreScreen.tsx`

- [ ] **Step 1: Rewrite the screen**

Replace the entire contents of `src/screens/ExploreScreen.tsx` with:

```tsx
import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/types';
import { listDestinations } from '../services/publicPlacesService';
import type { Destination } from '../services/publicPlaceHelpers';
import DestinationCard from '../components/DestinationCard';
import { Colors, Spacing } from '../theme';

export default function ExploreScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const rows = await listDestinations();
      setDestinations(rows);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>EXPLORE</Text>
        <Text style={styles.heading}>Discover Stories</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.accent} />
        </View>
      ) : (
        <FlatList
          data={destinations}
          keyExtractor={(d) => d.city}
          numColumns={2}
          columnWrapperStyle={styles.column}
          contentContainerStyle={styles.grid}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); void load(); }}
              tintColor={Colors.accent}
            />
          }
          renderItem={({ item }) => (
            <DestinationCard
              destination={item}
              onPress={() => navigation.navigate('Destination', { city: item.city })}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>🧭</Text>
              <Text style={styles.emptyHeading}>No community places yet</Text>
              <Text style={styles.emptyCaption}>Complete a trip to put places on the map</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.md },
  eyebrow: {
    fontSize: 11, fontWeight: '700', letterSpacing: 2,
    color: Colors.accent, textTransform: 'uppercase', marginBottom: 4,
  },
  heading: { fontSize: 26, fontWeight: '800', color: Colors.textPrimary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  grid: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.xl, gap: Spacing.md },
  column: { gap: Spacing.md },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingTop: 80, paddingHorizontal: Spacing.xl },
  emptyEmoji: { fontSize: 48, marginBottom: Spacing.md },
  emptyHeading: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },
  emptyCaption: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center' },
});
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/screens/ExploreScreen.tsx
git commit -m "feat: ExploreScreen destination grid (reads public_destinations)"
```

---

### Task 8: Full verification + manual QA

**Files:** none (verification only)

- [ ] **Step 1: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Full test suite**

Run: `npx jest`
Expected: all suites pass (301 prior + the new `publicPlaceHelpers`, `publicPlacesService`, `DestinationCard`, `PublicPlaceRow` tests).

- [ ] **Step 3: Seed a public place for manual QA (optional)**

If the dev `public_places` table is empty, the Explore grid will show the empty state (which is itself worth confirming). To see real data, complete a trip with eligible notes in the app (`npm run ios` → capture a food/activity note with a venue → wait for tagging → End Trip), or insert a temporary row via `execute_sql`:

```sql
insert into public.public_places
  (place_key, place_name, city, lat, lng, coord_count, visit_count, rating_sum, rating_count, category_counts, dominant_category)
values
  ('tartine bakery|san francisco', 'Tartine Bakery', 'San Francisco', 37.76, -122.42, 1, 3, 13, 3, '{"food":3}', 'food'),
  ('dolores park|san francisco', 'Dolores Park', 'San Francisco', 37.76, -122.43, 1, 2, 0, 0, '{"activity":2}', 'activity')
on conflict (place_key) do nothing;
```

- [ ] **Step 4: Manual QA checklist (`npm run ios`)**

  - Explore tab shows a grid of city cards sorted by total visits; each card shows "N places · N visits" and category dots.
  - Empty `public_places` → the compass empty state appears instead.
  - Tapping a city opens the Destination screen: map with category-colored pins, filter chips (All + present categories), ranked list (most-visited first).
  - Tapping a filter chip filters both the map pins and the list.
  - Tapping a place row centers the map on its pin and opens the callout (name · visits · ★rating).
  - A city whose places have no coordinates shows the list only (no map).
  - Back button returns to Explore.

- [ ] **Step 5: Clean up QA seed rows (if Step 3's insert was used)**

```sql
delete from public.public_places
where place_key in ('tartine bakery|san francisco', 'dolores park|san francisco');
```

- [ ] **Step 6: Commit (only if any fixes were made during QA)**

```bash
git add -A
git commit -m "fix: Explore UI QA adjustments"
```

---

## Self-Review

**Spec coverage:**
- `public_destinations` view (with `categories`) → Task 1. ✓
- `avgRating` / `rankPlaces` / `categoriesPresent` + `Destination`/`PublicPlace` types → Task 2. ✓
- `listDestinations` / `listPlacesByCity` service → Task 3. ✓
- `DestinationCard` (city, place_count, total_visits, category dots, no image) → Task 4. ✓
- `PublicPlaceRow` (name, CategoryBadge, visits, ★avg) → Task 5. ✓
- `DestinationScreen` (map via mapHelpers, filter chips on map+list, ranked list, tap-row-focuses-pin, list-only when no coords) + `Destination` route → Task 6. ✓
- `ExploreScreen` rewrite (grid, search bar removed, popularity sort, empty state, load-on-focus + pull-to-refresh, navigate to Destination) → Task 7. ✓
- Testing (helpers, service, two component render tests; map logic via existing mapHelpers) → Tasks 2–5 + 8. ✓
- Deferred items (imagery, search, place detail) → not built, consistent with spec. ✓

**Placeholder scan:** No TBD/TODO; every code and test block is complete.

**Type consistency:** `Destination` (`city`, `place_count`, `total_visits`, `categories: Category[]`) and `PublicPlace` (with narrowed `dominant_category: Category | null`) are defined in Task 2 and used identically in Tasks 3–7. Service names (`listDestinations`, `listPlacesByCity`), helper names (`avgRating`, `rankPlaces`, `categoriesPresent`), and the `Destination` route param (`{ city: string }`) match across all tasks. `regionForPins` (takes `{lat,lng}[]`) and `pinColor` (takes `Category | null`) are used per their existing `mapHelpers` signatures.
