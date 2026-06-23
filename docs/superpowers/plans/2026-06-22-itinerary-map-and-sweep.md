# Itinerary Mini-Map + Stale-Generation Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an overview map to the blog itinerary view, and a pg_cron sweep that fails blog generations stuck in `generating`.

**Architecture:** A new `ItineraryMap` component renders one `react-native-maps` overview map atop `ItineraryView`, reusing `mapHelpers` (`pinColor` + a generalized `regionForPins`) and a type-narrowing `stopsWithCoords` helper. A migration enables `pg_cron` and schedules a 5-minute SQL UPDATE that marks stale `generating` posts as `error`; no client code changes for the sweep.

**Tech Stack:** React Native (Expo), `react-native-maps`, TypeScript, Jest, Supabase Postgres + `pg_cron`.

**Spec:** `docs/superpowers/specs/2026-06-22-itinerary-map-and-sweep-design.md`

**Branch:** `feature/itinerary-map-and-sweep` (already created from `main`; the spec is committed here).

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `src/services/mapHelpers.ts` | Add `LatLng` type; widen `regionForPins` param to `LatLng[]` | Modify |
| `src/services/__tests__/mapHelpers.test.ts` | Add a plain-`LatLng[]` case for `regionForPins` | Modify |
| `src/services/blogHelpers.ts` | `LocatedStop` type + `stopsWithCoords` helper | Modify |
| `src/services/__tests__/blogHelpers.test.ts` | `stopsWithCoords` unit tests | Modify |
| `src/components/ItineraryMap.tsx` | Overview map of itinerary stops (pins + callouts) | Create |
| `src/components/ItineraryView.tsx` | Render `ItineraryMap` above the day cards | Modify |
| `src/components/__tests__/ItineraryView.render.test.tsx` | Mock `react-native-maps` so the suite stays native-free | Modify |
| `supabase/migrations/015_blog_posts_stale_sweep.sql` | Enable `pg_cron` + schedule the sweep | Create |

---

## Task 1: Generalize `regionForPins` to accept any `{lat,lng}`

**Files:**
- Modify: `src/services/mapHelpers.ts`
- Test: `src/services/__tests__/mapHelpers.test.ts`

- [ ] **Step 1: Add the failing test**

In `src/services/__tests__/mapHelpers.test.ts`, inside the existing `describe('regionForPins', ...)` block, add:

```ts
  it('accepts a plain lat/lng list (not just MapPins)', () => {
    const region = regionForPins([
      { lat: 10, lng: 20 },
      { lat: 12, lng: 24 },
    ])!;
    expect(region.latitude).toBeCloseTo(11);
    expect(region.longitude).toBeCloseTo(22);
  });
```

- [ ] **Step 2: Run the type-check to verify it fails**

Run: `npx tsc --noEmit`
Expected: FAIL — the plain objects are not assignable to `MapPin[]` (missing `id`, `category`, etc.).

(Jest itself would pass because the transpiler strips types; the meaningful failure is `tsc`.)

- [ ] **Step 3: Widen the signature**

In `src/services/mapHelpers.ts`, add the `LatLng` type just above `export function regionForPins` and change the parameter type. The function body is unchanged (it only reads `.lat`/`.lng`):

```ts
export type LatLng = { lat: number; lng: number };

export function regionForPins(points: LatLng[]): Region | null {
```

Then update the references inside the body from `pins` to `points` (the loop variable and the `.length`/index checks). The full updated function:

```ts
export function regionForPins(points: LatLng[]): Region | null {
  if (points.length === 0) return null;
  if (points.length === 1) {
    return {
      latitude: points[0].lat,
      longitude: points[0].lng,
      latitudeDelta: DEFAULT_DELTA,
      longitudeDelta: DEFAULT_DELTA,
    };
  }
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * PADDING, MIN_DELTA),
    longitudeDelta: Math.max((maxLng - minLng) * PADDING, MIN_DELTA),
  };
}
```

(`MapPin` has `lat`/`lng`, so `TripMapScreen`'s existing `regionForPins(filtered)` call still type-checks — `MapPin[]` is assignable to `LatLng[]`.)

- [ ] **Step 4: Verify tsc + tests pass**

Run: `npx tsc --noEmit`
Expected: PASS.

Run: `npx jest src/services/__tests__/mapHelpers.test.ts`
Expected: PASS (all existing + the new case).

- [ ] **Step 5: Commit**

```bash
git add src/services/mapHelpers.ts src/services/__tests__/mapHelpers.test.ts
git commit -m "refactor: regionForPins accepts any lat/lng list"
```

---

## Task 2: `stopsWithCoords` helper (TDD)

**Files:**
- Modify: `src/services/blogHelpers.ts`
- Test: `src/services/__tests__/blogHelpers.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/services/__tests__/blogHelpers.test.ts`, extend the import from `../blogHelpers` to add `stopsWithCoords`, and import the `Itinerary` type. The existing import block is a value import; add a separate type import line after it:

```ts
import type { Itinerary } from '../blogHelpers';
```

Then append at the end of the file:

```ts
describe('stopsWithCoords', () => {
  const itinerary: Itinerary = [
    {
      day: 1,
      date: null,
      title: 'Day one',
      stops: [
        { time_of_day: 'morning', place_name: 'A', category: 'food', description: '', lat: 1, lng: 2 },
        { time_of_day: null, place_name: 'B', category: null, description: '', lat: null, lng: null },
      ],
    },
    {
      day: 2,
      date: null,
      title: 'Day two',
      stops: [
        { time_of_day: 'evening', place_name: 'C', category: 'activity', description: '', lat: 3, lng: 4 },
      ],
    },
  ];

  it('flattens days and keeps only stops with both coords', () => {
    const result = stopsWithCoords(itinerary);
    expect(result.map((s) => s.place_name)).toEqual(['A', 'C']);
    expect(result[0].lat).toBe(1);
    expect(result[1].lng).toBe(4);
  });

  it('returns an empty array when no stop has coords', () => {
    const none: Itinerary = [
      { day: 1, date: null, title: 'x', stops: [
        { time_of_day: null, place_name: 'B', category: null, description: '', lat: null, lng: null },
      ] },
    ];
    expect(stopsWithCoords(none)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/services/__tests__/blogHelpers.test.ts -t stopsWithCoords`
Expected: FAIL — `stopsWithCoords is not a function`.

- [ ] **Step 3: Implement the helper**

In `src/services/blogHelpers.ts`, add after the `parseItinerary` function (it uses the existing `ItineraryStop`/`Itinerary` types):

```ts
export type LocatedStop = ItineraryStop & { lat: number; lng: number };

/** Flattens an itinerary to the stops that have both coordinates (for the map). */
export function stopsWithCoords(itinerary: Itinerary): LocatedStop[] {
  return itinerary
    .flatMap((day) => day.stops)
    .filter((s): s is LocatedStop => s.lat !== null && s.lng !== null);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest src/services/__tests__/blogHelpers.test.ts -t stopsWithCoords`
Expected: PASS.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/blogHelpers.ts src/services/__tests__/blogHelpers.test.ts
git commit -m "feat: stopsWithCoords helper + LocatedStop type"
```

---

## Task 3: `ItineraryMap` component + wire into `ItineraryView`

**Files:**
- Create: `src/components/ItineraryMap.tsx`
- Modify: `src/components/ItineraryView.tsx`
- Modify: `src/components/__tests__/ItineraryView.render.test.tsx`

- [ ] **Step 1: Create the map component**

Create `src/components/ItineraryMap.tsx`:

```tsx
import { StyleSheet, View, Text } from 'react-native';
import MapView, { Marker, Callout, PROVIDER_DEFAULT } from 'react-native-maps';
import { Spacing, BorderRadius } from '../theme';
import { regionForPins, pinColor } from '../services/mapHelpers';
import { categoryLabel } from '../services/noteHelpers';
import type { LocatedStop } from '../services/blogHelpers';

export default function ItineraryMap({ stops }: { stops: LocatedStop[] }) {
  const region = regionForPins(stops);
  if (!region) return null;
  return (
    <View style={styles.wrap}>
      <MapView style={styles.map} provider={PROVIDER_DEFAULT} initialRegion={region}>
        {stops.map((s, i) => (
          <Marker
            key={`${s.place_name}-${i}`}
            coordinate={{ latitude: s.lat, longitude: s.lng }}
            pinColor={pinColor(s.category)}
          >
            <Callout>
              <View style={styles.callout}>
                <Text style={styles.calloutTitle}>{s.place_name}</Text>
                {s.category ? <Text style={styles.calloutMeta}>{categoryLabel(s.category)}</Text> : null}
              </View>
            </Callout>
          </Marker>
        ))}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: 200,
    borderRadius: BorderRadius.card,
    overflow: 'hidden',
    marginBottom: Spacing.md,
  },
  map: { flex: 1 },
  // Apple Maps renders callouts in a light bubble, so use dark text here.
  callout: { padding: Spacing.xs, maxWidth: 220 },
  calloutTitle: { fontSize: 14, fontWeight: '700', color: '#111111' },
  calloutMeta: { fontSize: 12, color: '#333333', marginTop: 2 },
});
```

- [ ] **Step 2: Render the map in `ItineraryView`**

In `src/components/ItineraryView.tsx`, update the import line for `blogHelpers` to also pull `stopsWithCoords`, and add the `ItineraryMap` import:

```ts
import { formatBlogDate, stopsWithCoords, type Itinerary, type TimeOfDay } from '../services/blogHelpers';
import ItineraryMap from './ItineraryMap';
```

Then, inside the component, compute the located stops and render the map above the day cards. Change the start of the returned JSX:

```tsx
export default function ItineraryView({ itinerary }: { itinerary: Itinerary }) {
  const mapStops = stopsWithCoords(itinerary);
  return (
    <View style={styles.container}>
      {mapStops.length > 0 ? <ItineraryMap stops={mapStops} /> : null}
      {itinerary.map((day, dayIndex) => (
```

(The rest of the `.map(...)` body and the closing tags are unchanged.)

- [ ] **Step 3: Mock `react-native-maps` in the existing render test**

`ItineraryView` now imports `ItineraryMap`, which imports the native `react-native-maps`. Add a mock at the very top of `src/components/__tests__/ItineraryView.render.test.tsx` (before the other imports) so the suite stays native-free and map content doesn't duplicate the day-card text the test asserts on:

```tsx
jest.mock('react-native-maps', () => ({
  __esModule: true,
  default: () => null,
  Marker: () => null,
  Callout: () => null,
  PROVIDER_DEFAULT: 'default',
}));
```

- [ ] **Step 4: Type-check and run the affected tests**

Run: `npx tsc --noEmit`
Expected: PASS.

Run: `npx jest src/components/__tests__/ItineraryView.render.test.tsx`
Expected: PASS (existing day-card assertions still green; the mocked map renders nothing).

- [ ] **Step 5: Run the full suite**

Run: `npx jest`
Expected: PASS (no regressions).

- [ ] **Step 6: Commit**

```bash
git add src/components/ItineraryMap.tsx src/components/ItineraryView.tsx src/components/__tests__/ItineraryView.render.test.tsx
git commit -m "feat: itinerary overview map (0c follow-up)"
```

---

## Task 4: pg_cron stale-generation sweep

**Files:**
- Create: `supabase/migrations/015_blog_posts_stale_sweep.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/015_blog_posts_stale_sweep.sql`:

```sql
-- Server-side backstop for stuck blog generations. A photo-heavy generate-blog
-- run can be killed by the platform wall-clock before it writes a status,
-- orphaning the row in 'generating' forever. The client already recovers
-- (isStaleGenerating), but nothing server-side resolves the row. A pg_cron job
-- fails any 'generating' post older than 5 minutes — safely beyond any
-- legitimate run (preprocessing + the 140s Claude call is well under 3 min), so
-- it never touches a live generation.
create extension if not exists pg_cron;

-- Idempotent: cron.schedule upserts a job by name (pg_cron 1.6).
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

- [ ] **Step 2: Apply the migration**

Use the Supabase MCP `apply_migration` tool (project `dcejrbyujfcxartywpis`), name `blog_posts_stale_sweep`, with the SQL above. If it errors on `pg_cron` permissions or the `cron` schema being unavailable, STOP and report BLOCKED with the exact error (do not work around it).

- [ ] **Step 3: Verify the job is scheduled**

Use the Supabase MCP `execute_sql` tool:

```sql
select jobname, schedule, active from cron.job where jobname = 'sweep-stale-blog-posts';
```

Expected: one row — `sweep-stale-blog-posts | */5 * * * * | true`.

- [ ] **Step 4: Verify the predicate is correct (without waiting for the schedule)**

Use the Supabase MCP `execute_sql` tool to dry-run the WHERE clause as a SELECT (read-only, changes nothing):

```sql
select id, created_at
from public.blog_posts
where status = 'generating' and created_at < now() - interval '5 minutes';
```

Expected: returns only genuinely-old generating rows (likely zero during normal operation). Confirms the predicate targets the right rows.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/015_blog_posts_stale_sweep.sql
git commit -m "feat: pg_cron sweep for stale blog generations"
```

---

## Task 5: Final verification + docs + finish

**Files:**
- Modify: `docs/progress.md`

- [ ] **Step 1: Full verification**

Run: `npx tsc --noEmit`
Expected: PASS.

Run: `npx jest`
Expected: PASS (full suite).

- [ ] **Step 2: On-device QA (manual)**

Build/run (`npm run ios`). Open France → blog → Itinerary tab. Verify:
- An overview map shows above the day cards with category-colored pins.
- Tapping a pin shows a callout with the place name (+ category).
- The map frames all the trip's stops.
- (Negative) An itinerary whose stops have no coords shows day cards only (no map).

- [ ] **Step 3: Update the progress doc**

In `docs/progress.md`, update the top **Status** line to note the itinerary mini-map + stale-generation sweep shipped (mirroring the format of existing entries: what shipped, migration `015`, the cron job, test count, tsc clean). Commit:

```bash
git add docs/progress.md
git commit -m "docs: itinerary mini-map + stale-generation sweep"
```

- [ ] **Step 4: Finish the branch**

Use the superpowers:finishing-a-development-branch skill to decide merge/PR. (Per project memory: branch from `main`, no worktrees.)

---

## Notes for the implementer

- **TDD surfaces:** Task 1 (`regionForPins` widening, verified via `tsc` + a new test case) and Task 2 (`stopsWithCoords`). The `ItineraryMap` component and the cron job are not unit-tested (native maps / DB), consistent with the project leaving `TripMapScreen` and edge/DB code to MCP + device verification.
- **Why mock `react-native-maps` in Task 3:** `ItineraryView` is unit-tested and now imports the map; without the mock, Jest would load the native module and the suite would break. The mock renders nothing so the day-card text assertions stay unambiguous.
- **No edge-function redeploy** — `generate-blog` is unchanged.
- **No `database.types.ts` change** — the sweep alters no table schema.
