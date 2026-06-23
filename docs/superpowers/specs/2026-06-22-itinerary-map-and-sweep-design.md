# Itinerary Mini-Map + Stale-Generation Sweep — Design

**Date:** 2026-06-22
**Status:** Approved design — ready for plan
**Depends on:** Itinerary creation from blog (0c, merged PR #11) — `blog_posts.itinerary jsonb`, `parseItinerary`, `ItineraryView`; Phase 8 trip map — `react-native-maps`, `mapHelpers`
**Context:** the two items deferred from 0c.

---

## Problem

Two follow-ups left from the itinerary feature (0c):

1. **No map.** The itinerary stores `lat`/`lng` per stop but renders text-only day cards. A map showing where each day's stops are would make the trip's shape legible at a glance.
2. **No server-side backstop for stuck generations.** A photo-heavy `generate-blog` run can be killed by the platform wall-clock before it writes a status, leaving the row in `generating` forever. 0c added a *client-side* recovery (`isStaleGenerating` → retry path), but nothing on the server ever resolves the orphaned row.

This ships both: an itinerary overview map, and a scheduled DB sweep that fails truly-stuck rows.

---

## Scope

**In:**
- An `ItineraryMap` component: one fixed-height overview map atop the Itinerary view, category-colored pins for stops with coords, tappable callouts.
- Generalize `regionForPins` so itinerary stops (not `Note`s) can reuse it; a pure `stopsWithCoords` helper.
- Migration enabling `pg_cron` + a 5-minute sweep that marks stale `generating` posts as `error`.

**Out (deferred / not needed):**
- Per-day maps (one overview map only).
- Editing stops from the map (itinerary is read-only).
- Any client change for the sweep (existing realtime + error UI already handle the flip).
- A separate edge function for the sweep (pure SQL via pg_cron is enough).

---

## Part A — Itinerary Mini-Map

### Component: `src/components/ItineraryMap.tsx`
- Props: `{ stops: LocatedStop[] }` (already-filtered to stops with coords; see `stopsWithCoords` below).
- Renders a `MapView` (`react-native-maps`, `PROVIDER_DEFAULT`) at a fixed height (~200px), `initialRegion` from `regionForPins(stops)`.
- One `Marker` per stop at `{ latitude: stop.lat, longitude: stop.lng }`, `pinColor={pinColor(stop.category)}`, with a `Callout` showing `place_name` (+ category label). Callout text uses dark colors (Apple Maps renders callouts in a light bubble — same gotcha as `TripMapScreen`).
- Built to match `TripMapScreen`'s idiom. The map sits inside the post's existing `ScrollView`; a fixed height is the standard treatment (dragging the map pans the map; scrolling elsewhere scrolls the page).
- Not unit-tested — importing `react-native-maps` pulls the native module into Jest. Consistent with Phase 8 leaving `TripMapScreen` untested; verified on device.

### `mapHelpers.ts` changes
- Generalize the region helper so non-`MapPin` coordinate lists work:
  ```ts
  export type LatLng = { lat: number; lng: number };
  export function regionForPins(points: LatLng[]): Region | null { /* unchanged body */ }
  ```
  `MapPin` already has `lat`/`lng`, so `TripMapScreen`'s existing call still type-checks with no change. Only the parameter type widens.

### `blogHelpers.ts` — pure helper (testable)
A type-predicate filter narrows `lat`/`lng` to `number`, so the map component needs no non-null assertions:
```ts
export type LocatedStop = ItineraryStop & { lat: number; lng: number };

export function stopsWithCoords(itinerary: Itinerary): LocatedStop[] {
  return itinerary
    .flatMap((day) => day.stops)
    .filter((s): s is LocatedStop => s.lat !== null && s.lng !== null);
}
```
`ItineraryMap`'s `stops` prop is then `LocatedStop[]`, and `regionForPins(stops)` type-checks directly (a `LocatedStop` has `number` `lat`/`lng`, satisfying `LatLng`).

### `ItineraryView.tsx` wiring
- Compute `const mapStops = stopsWithCoords(itinerary);`
- When `mapStops.length > 0`, render `<ItineraryMap stops={mapStops} />` above the day cards. Otherwise render day cards only (unchanged).

---

## Part B — Stale-Generation Sweep

### Migration: `supabase/migrations/015_blog_posts_stale_sweep.sql`
```sql
-- Server-side backstop for stuck blog generations. A photo-heavy generate-blog
-- run can be killed by the platform wall-clock before it writes a status,
-- orphaning the row in 'generating' forever. The client already recovers
-- (isStaleGenerating), but nothing server-side resolves the row. A pg_cron job
-- fails any 'generating' post older than 5 minutes — safely beyond any
-- legitimate run (preprocessing + the 140s Claude call is well under 3 min), so
-- it never touches a live generation.
create extension if not exists pg_cron;

select cron.schedule(
  'sweep-stale-blog-posts',
  '*/5 * * * *',
  $$update public.blog_posts
      set status = 'error',
          error_message = 'Generation timed out.'
    where status = 'generating'
      and created_at < now() - interval '5 minutes'$$
);
```
- `cron.schedule` with a fixed job name is idempotent in pg_cron 1.6 (re-running updates the existing job rather than duplicating).
- No client changes: the `BlogPostScreen` realtime subscription flips the row to the existing `error` view, and `TripDetailScreen` already treats `error` as a retry path.

### Verification (via Supabase MCP)
- After applying, confirm the job exists: `select jobname, schedule, active from cron.job where jobname = 'sweep-stale-blog-posts';`
- Sanity-check the predicate by hand (the same `update ... returning` against a known-old row), without waiting for the schedule.

---

## Testing

- `stopsWithCoords` unit tests (flattens days, keeps only stops with both coords, handles empty).
- `regionForPins` — existing tests still pass after the parameter widening; add a case passing a plain `LatLng[]`.
- `ItineraryMap` — not unit-tested (native maps); device QA.
- Sweep — not unit-tested (DB/cron); MCP verification + manual predicate check.
- Full Jest suite + `npx tsc --noEmit` green before merge.

---

## Deployment

- Apply migration `015` via Supabase MCP (project `dcejrbyujfcxartywpis`); verify the cron job row.
- No edge-function redeploy (no `generate-blog` change).
- On-device QA: France's itinerary shows the overview map with category-colored pins and working callouts; a no-coords itinerary (if any) shows day cards only.

---

## Key Decisions

| Decision | Choice | Reason |
|---|---|---|
| Map layout | One overview map atop the itinerary | Shows the trip's shape at a glance; avoids many heavy per-day map instances |
| Pin interaction | Tappable callout (place name + category) | Matches the trip-map idiom; identifies each pin |
| Region math | Generalize `regionForPins` to `LatLng[]` | Reuse existing bounding-box logic for non-`Note` coords, no duplication |
| Sweep mechanism | `pg_cron` running plain SQL | No edge function needed; the fix is a single UPDATE |
| Sweep threshold | 5 minutes | Safely beyond any legitimate run, so it never fails a live generation |
| Sweep client work | None | Existing realtime + error UI already surface the flip and offer retry |
