# Explore UI — Design Spec

**Date:** 2026-06-25
**Backlog item:** Public layer (#3 Explore + #4 privacy) — **Spec B of two.**
Spec A (the public data layer) is merged: `public_places` aggregate +
`public_place_contributions` ledger + trip-completion trigger. This spec builds
the UI that reads `public_places`. Spec A:
`docs/superpowers/specs/2026-06-24-public-data-layer-design.md`.

## Goal

Turn the placeholder Explore tab into a real community-discovery surface: a
global grid of destinations (cities) sorted by popularity, and a per-destination
page with a community map and a ranked list of places. All data comes from the
anonymized `public_places` aggregate — **no user identity, no photos, no prose**.

## Scope

In scope: a `public_destinations` SQL view, a `publicPlacesService` + pure
helpers, a rewritten `ExploreScreen` (destination grid), a new `DestinationScreen`
(map + ranked list), and the `DestinationCard` / `PublicPlaceRow` components.

Out of scope (deferred): search/filtering inside Explore (the search bar is
removed for V1); the separate semantic Search tab (V2); per-place detail screens
(no extra data to show); city-card imagery / map-thumbnail cards (fast-follow
polish — see "Deferred"); realtime updates (load-on-focus + pull-to-refresh is
enough since `public_places` only changes on trip completion).

## Key constraints (carried from Spec A)

- **No imagery.** `public_places` stores no photos or prose, so destination cards
  and place rows are data-forward (city/place name, counts, ratings, category
  color) — not photo cards like Home's `TripCard`.
- **`city` is the only geographic grouping key** — a "destination" is a city.
  There is no country/region column; no hierarchy.
- **`avg_rating` is derived, not stored** — computed client-side from
  `rating_sum / rating_count` (Spec A deliberately stores the sum + count).
- **Coordinates are nullable.** A place with no coords appears in the ranked list
  but not on the map.
- **Public categories are food/stay/activity/shopping** (Spec A excludes
  `general` and `to-visit`), so those are the only `dominant_category` values
  that appear.

## Data layer

### Migration `022_public_destinations_view.sql`

```sql
-- One row per city: place count, total community visits, and the distinct
-- categories present (for the card's color dots). Drives the Explore grid.
-- security_invoker so it honors public_places' public-read RLS.
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

Regenerate `src/lib/database.types.ts` afterward (the view appears under
`public.Views`). Apply via Supabase MCP `apply_migration`, project
`dcejrbyujfcxartywpis`.

### Pure helpers — `src/services/publicPlaceHelpers.ts`

- Types `Destination` (`city`, `place_count`, `total_visits`, `categories:
  Category[]`) and `PublicPlace` (the `public_places` row, narrowed:
  `dominant_category` to the `Category | null` union).
- `avgRating(ratingSum: number, ratingCount: number): number | null` — returns
  `null` when `ratingCount === 0`, else `ratingSum / ratingCount`.
- `rankPlaces(places: PublicPlace[]): PublicPlace[]` — stable sort by
  `visit_count` desc, then `avg_rating` desc (nulls last).
- `categoriesPresent(places: PublicPlace[]): Category[]` — distinct
  `dominant_category` values among the places, in `CATEGORIES` order, for the
  filter chips.

### Service — `src/services/publicPlacesService.ts`

- `listDestinations(): Promise<Destination[]>` — `select * from
  public_destinations order by total_visits desc`.
- `listPlacesByCity(city: string): Promise<PublicPlace[]>` — `select * from
  public_places where city = <city>` (ranking applied in JS via `rankPlaces`,
  since the tiebreak `avg_rating` is derived; per-city place counts are small).

Thin Supabase wrappers, matching the existing `tripService` / `blogService`
style. No realtime.

## Navigation

- Add `Destination: { city: string }` to `MainStackParamList`
  (`src/navigation/types.ts`).
- Register `DestinationScreen` in `MainStack` as a sibling of `TripDetail`.
- Explore card press → `navigation.navigate('Destination', { city })` (same
  pattern as the Home → `TripDetail` push).

## Screens & components

### `ExploreScreen` (rewrite `src/screens/ExploreScreen.tsx`)

- Header: keep the "EXPLORE / Discover Stories" eyebrow + heading; **remove the
  search bar**.
- `FlatList` with `numColumns={2}` of `DestinationCard`s, data from
  `listDestinations()` (already sorted by popularity). Loads on focus
  (`useFocusEffect` / mount), pull-to-refresh.
- Empty state (no rows): reuse the existing compass empty-state style — heading
  "No community places yet", caption "Complete a trip to put places on the map."
- Loading: a spinner while the first load is in flight.
- Tap a card → `navigate('Destination', { city })`.

### `DestinationCard` (`src/components/DestinationCard.tsx`)

Data-forward card: city name (headline), `place_count` ("N places"),
`total_visits` ("N visits"), and a small row of `CategoryColors` dots from the
`Destination.categories` array (carried by the view, so the grid renders dots
from its single query — no per-card fetch). Dark surface (`Colors.surface`) +
amber accent, no image.

### `DestinationScreen` (`src/screens/DestinationScreen.tsx`)

- Title = `city`, back button.
- Loads `listPlacesByCity(city)` on mount; derives ranked places (`rankPlaces`),
  map pins (places with coords), and present categories (`categoriesPresent`).
- **Community map (top):** reuse `react-native-maps` `MapView` with
  `regionForPins` + `pinColor(dominant_category)` from `mapHelpers`, modeled on
  `TripMapScreen` / `ItineraryMap`. Markers for places **with coords**; callout
  shows name · "N visits" · ★avg (when rated). If no place in the city has
  coords, hide the map and show the list only.
- **Category filter chips:** a row (All + each category in `categoriesPresent`)
  between map and list; selecting one filters **both** the map markers and the
  ranked list by `dominant_category`. Reuse `CategoryColors`.
- **Ranked list:** `PublicPlaceRow`s in `rankPlaces` order.
- **Tap a row** → animate the map to that place's pin and open its callout
  (`mapRef.animateToRegion` + marker focus). No detail screen.
- Loading + empty (`city` somehow has no places) states.

### `PublicPlaceRow` (`src/components/PublicPlaceRow.tsx`)

Row: place name, `CategoryBadge` (existing) for `dominant_category`,
`visit_count` ("N visits"), and ★avg (`avgRating`, one decimal) when rated.

## Testing

- **Pure helpers** (`publicPlaceHelpers`) — TDD unit tests: `avgRating` (zero
  count → null; normal average), `rankPlaces` (visit-count order, avg tiebreak,
  nulls last, stability), `categoriesPresent` (distinct, ordered, excludes none
  present).
- **Service** (`publicPlacesService`) — mocked Supabase, matching existing
  service-test style: `listDestinations` ordering, `listPlacesByCity` filter +
  error path.
- **Component render tests** — `DestinationCard` and `PublicPlaceRow` (the
  codebase has `.render.test` precedent, e.g. `TripCard.render.test.tsx`).
- **Map logic** is already covered by `mapHelpers` tests and reused unchanged.

## Error & empty states (summary)

- Explore grid empty → compass empty-state.
- Destination has places but none with coords → list only, no map.
- Service errors → a simple inline error/retry (match existing screens' handling).

## Deferred (noted, not built)

- **City-card imagery** — no photo data exists; a mini-map thumbnail per card is
  possible from stored coords but needs either many live `MapView`s (janky) or an
  external static-map provider (API key + cost). Revisit as polish once Explore
  is real.
- **In-Explore search** — removed for V1; a client-side city filter is a cheap
  later addition.
- **Per-place detail screen** — metadata-only, nothing to add beyond the row.
