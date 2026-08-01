# Trip-Aware Location Inference Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop notes from being tagged with the device's location when it's implausible for the trip (e.g. "Mountain View" on a Paris trip), and silently correct existing wrong notes — using a new `location_source` provenance column and trip "anchors" derived from `trips.destinations` + trusted notes.

**Architecture:** Three thin layers, matching the codebase convention: pure helpers (`tripAnchorHelpers.ts` — haversine, plausibility, anchor selection; extended `locationHelpers.ts` — provenance in `resolveLocationEdit`), thin Supabase services (`tripAnchorService.ts` — fetch+geocode+memoize anchors; `locationSweepService.ts` — launch-time outlier correction), and UI wiring (`NoteCaptureSheet` checks GPS plausibility as soon as fix+trip are known so the location pill shows what will save; `NoteEditSheet` marks edits `'manual'`). EXIF and manual paths are never second-guessed.

**Tech Stack:** React Native (Expo), TypeScript, Supabase (Postgres + RLS), Jest (jest-expo), expo-location.

**Spec:** `docs/superpowers/specs/2026-06-10-trip-aware-location-inference-design.md`

**Threshold constant:** `ANCHOR_PLAUSIBLE_KM = 200` — a GPS fix is plausible if within 200 km of *any* anchor.

**Trust rules (used everywhere):**
- Anchors = geocoded `trips.destinations` entries + coords of notes with `location_source` `'exif'` or `'manual'`.
- Only `'gps'` / `null`-source notes are ever rewritten. `'exif'`/`'manual'` are never touched.
- Empty anchor list → no judgment → GPS passes through unchanged (inference never blocks a save).

**Project gotchas (read before starting):**
- Run tests with `npx jest`, typecheck with `npx tsc --noEmit`. Both must be green before every commit.
- Pure helper files must import app types with `import type` only, so Jest never loads `supabase`/native modules.
- Supabase project id: `dcejrbyujfcxartywpis`. Apply migrations via the Supabase MCP `apply_migration` tool (local `db push` has a migration-history mismatch; see `docs/progress.md`).
- `jest.mock` factories must reference mock fns lazily through closures (hoisting), e.g. `geocodeLocation: (...a: unknown[]) => mockGeocode(...a)`.
- Never run `pod install` or `expo prebuild` directly; this plan needs neither.

---

### Task 0: Branch from main

**Files:** none

- [ ] **Step 1: Create the feature branch**

```bash
cd "/Users/rutvijdhotey/Documents/Personal Projects/Notebound"
git checkout main && git pull && git checkout -b feature/trip-aware-location-inference
```

Expected: `Switched to a new branch 'feature/trip-aware-location-inference'`. (Per user preference: always a fresh branch from main, never a worktree.)

---

### Task 1: Migration 011 — `notes.location_source` + types

**Files:**
- Create: `supabase/migrations/011_notes_location_source.sql`
- Modify: `src/lib/database.types.ts` (notes Row/Insert/Update)
- Modify: `src/services/locationHelpers.ts` (add `LocationSource` type only)
- Modify: `src/services/noteHelpers.ts:3-15` (re-type `Note`/`NoteInsert`)

- [ ] **Step 1: Write the migration file**

```sql
-- location_source: provenance of a note's coordinates.
--   'exif'     — photo EXIF GPS (trusted: the photo was there)
--   'gps'      — device GPS, judged plausible for the trip
--   'inferred' — device GPS rejected; location substituted from the trip anchor
--   'manual'   — typed by the user (capture or edit sheet)
--   null       — legacy rows and notes with no location
alter table public.notes
  add column location_source text
  check (location_source in ('gps', 'exif', 'manual', 'inferred'));
```

- [ ] **Step 2: Apply the migration**

Use the Supabase MCP `apply_migration` tool with name `notes_location_source` and the SQL above, against project `dcejrbyujfcxartywpis`. Verify with `list_migrations` (new entry) or an `execute_sql` of `select location_source from public.notes limit 1`.

- [ ] **Step 3: Add `LocationSource` to `locationHelpers.ts`**

At the top of `src/services/locationHelpers.ts`, above `LocationPatch`:

```typescript
export type LocationSource = 'gps' | 'exif' | 'manual' | 'inferred';
```

(`LocationPatch` itself changes in Task 3 — only the type alias is added here.)

- [ ] **Step 4: Add the column to `database.types.ts`**

In the `notes` table block of `src/lib/database.types.ts`, add to **Row**:

```typescript
          location_source: string | null
```

and to both **Insert** and **Update**:

```typescript
          location_source?: string | null
```

(Alphabetical placement next to `lng`/`occurred_at` to match the file's ordering.)

- [ ] **Step 5: Re-type `Note`/`NoteInsert` in `noteHelpers.ts`**

The file currently has (lines 9–15):

```typescript
export type Note = Omit<NoteRow, 'category' | 'tagging_status'> & {
  ...
};
export type NoteInsert = Omit<NoteInsertRow, 'category' | 'tagging_status'> & {
  ...
};
```

Add `'location_source'` to both `Omit` lists and add the narrowed field to both intersection objects (import the type with `import type { LocationSource } from './locationHelpers';`):

```typescript
export type Note = Omit<NoteRow, 'category' | 'tagging_status' | 'location_source'> & {
  // ...existing narrowed fields stay...
  location_source: LocationSource | null;
};
export type NoteInsert = Omit<NoteInsertRow, 'category' | 'tagging_status' | 'location_source'> & {
  // ...existing narrowed fields stay...
  location_source?: LocationSource | null;
};
```

- [ ] **Step 6: Verify and commit**

```bash
npx tsc --noEmit && npx jest
git add supabase/migrations/011_notes_location_source.sql src/lib/database.types.ts src/services/locationHelpers.ts src/services/noteHelpers.ts
git commit -m "feat: add notes.location_source provenance column (migration 011)"
```

Expected: tsc clean, 234 tests pass (no behavior change yet).

---

### Task 2: `tripAnchorHelpers` — pure anchor math (TDD)

**Files:**
- Create: `src/services/tripAnchorHelpers.ts`
- Test: `src/services/__tests__/tripAnchorHelpers.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
import {
  ANCHOR_PLAUSIBLE_KM,
  haversineKm,
  isPlausible,
  nearestAnchor,
  resolveAutoLocation,
  type AnchorPoint,
} from '../tripAnchorHelpers';

const PARIS: AnchorPoint = { lat: 48.8566, lng: 2.3522 };
const VERSAILLES: AnchorPoint = { lat: 48.8049, lng: 2.1204 };
const LONDON: AnchorPoint = { lat: 51.5074, lng: -0.1278 };
const MOUNTAIN_VIEW: AnchorPoint = { lat: 37.3861, lng: -122.0839 };

describe('haversineKm', () => {
  it('is zero for identical points', () => {
    expect(haversineKm(PARIS, PARIS)).toBe(0);
  });

  it('computes known distances within 2% (Paris–London ≈ 344 km)', () => {
    expect(haversineKm(PARIS, LONDON)).toBeGreaterThan(335);
    expect(haversineKm(PARIS, LONDON)).toBeLessThan(355);
  });

  it('Paris–Versailles is a short hop (≈ 18 km)', () => {
    expect(haversineKm(PARIS, VERSAILLES)).toBeLessThan(25);
  });
});

describe('isPlausible', () => {
  it('is true with no anchors (no judgment possible)', () => {
    expect(isPlausible(MOUNTAIN_VIEW, [])).toBe(true);
  });

  it('is true within the threshold of any anchor', () => {
    expect(isPlausible(VERSAILLES, [LONDON, PARIS])).toBe(true);
  });

  it('is false when far from every anchor', () => {
    expect(isPlausible(MOUNTAIN_VIEW, [PARIS, LONDON])).toBe(false);
  });

  it('uses the 200 km default threshold (London is implausible for a Paris-only trip)', () => {
    expect(ANCHOR_PLAUSIBLE_KM).toBe(200);
    expect(isPlausible(LONDON, [PARIS])).toBe(false);
  });
});

describe('nearestAnchor', () => {
  it('returns null for an empty anchor list', () => {
    expect(nearestAnchor(PARIS, [])).toBeNull();
  });

  it('picks the closest anchor', () => {
    expect(nearestAnchor(VERSAILLES, [LONDON, PARIS])).toEqual(PARIS);
  });
});

describe('resolveAutoLocation', () => {
  const exifFix = { lat: 48.86, lng: 2.34, city: 'Paris', placeName: 'Louvre' };
  const gpsParis = { lat: 48.85, lng: 2.35, city: 'Paris', placeName: 'Le Marais' };
  const gpsMtv = { lat: 37.3861, lng: -122.0839, city: 'Mountain View', placeName: 'Castro St' };

  it('EXIF always wins, no plausibility check', () => {
    expect(resolveAutoLocation(exifFix, gpsMtv, [PARIS])).toEqual({
      source: 'exif', lat: 48.86, lng: 2.34, city: 'Paris', place_name: 'Louvre',
    });
  });

  it('no EXIF and no GPS → null source', () => {
    expect(resolveAutoLocation(null, null, [PARIS])).toEqual({ source: null });
  });

  it('plausible GPS passes through as gps', () => {
    expect(resolveAutoLocation(null, gpsParis, [PARIS])).toEqual({
      source: 'gps', lat: 48.85, lng: 2.35, city: 'Paris', place_name: 'Le Marais',
    });
  });

  it('GPS with no anchors passes through as gps (no judgment)', () => {
    expect(resolveAutoLocation(null, gpsMtv, [])).toEqual({
      source: 'gps', lat: gpsMtv.lat, lng: gpsMtv.lng, city: 'Mountain View', place_name: 'Castro St',
    });
  });

  it('implausible GPS is replaced by the nearest anchor', () => {
    expect(resolveAutoLocation(null, gpsMtv, [LONDON, PARIS])).toEqual({
      source: 'inferred', anchor: LONDON,
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/services/__tests__/tripAnchorHelpers.test.ts`
Expected: FAIL — cannot find module `../tripAnchorHelpers`.

- [ ] **Step 3: Implement `tripAnchorHelpers.ts`**

```typescript
export type AnchorPoint = { lat: number; lng: number };

/** A GPS fix is plausible for a trip if within this distance of any anchor. */
export const ANCHOR_PLAUSIBLE_KM = 200;

const EARTH_RADIUS_KM = 6371;

export function haversineKm(a: AnchorPoint, b: AnchorPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** True when within `thresholdKm` of ANY anchor. Empty anchors → true (no judgment). */
export function isPlausible(
  point: AnchorPoint,
  anchors: AnchorPoint[],
  thresholdKm: number = ANCHOR_PLAUSIBLE_KM,
): boolean {
  if (anchors.length === 0) return true;
  return anchors.some((anchor) => haversineKm(point, anchor) <= thresholdKm);
}

export function nearestAnchor(point: AnchorPoint, anchors: AnchorPoint[]): AnchorPoint | null {
  let best: AnchorPoint | null = null;
  let bestDistance = Infinity;
  for (const anchor of anchors) {
    const d = haversineKm(point, anchor);
    if (d < bestDistance) {
      bestDistance = d;
      best = anchor;
    }
  }
  return best;
}

/** A resolved GPS/EXIF fix as the capture sheet sees it. */
export type AutoFix = {
  lat: number;
  lng: number;
  city: string | null;
  placeName: string | null;
};

/**
 * Decides the auto (non-manual) location for a new note.
 * - EXIF always wins (the photo was there) — never plausibility-checked.
 * - Plausible GPS passes through.
 * - Implausible GPS is replaced by the nearest anchor; the caller reverse-geocodes
 *   the anchor for city/place_name (async, so not done here).
 */
export type AutoLocation =
  | { source: 'exif' | 'gps'; lat: number; lng: number; city: string | null; place_name: string | null }
  | { source: 'inferred'; anchor: AnchorPoint }
  | { source: null };

export function resolveAutoLocation(
  exif: AutoFix | null,
  gps: AutoFix | null,
  anchors: AnchorPoint[],
): AutoLocation {
  if (exif) {
    return { source: 'exif', lat: exif.lat, lng: exif.lng, city: exif.city, place_name: exif.placeName };
  }
  if (!gps) return { source: null };
  if (isPlausible(gps, anchors)) {
    return { source: 'gps', lat: gps.lat, lng: gps.lng, city: gps.city, place_name: gps.placeName };
  }
  const anchor = nearestAnchor(gps, anchors);
  // Unreachable in practice (implausible implies non-empty anchors), kept for type safety.
  if (!anchor) {
    return { source: 'gps', lat: gps.lat, lng: gps.lng, city: gps.city, place_name: gps.placeName };
  }
  return { source: 'inferred', anchor };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/services/__tests__/tripAnchorHelpers.test.ts`
Expected: PASS (13 tests).

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit
git add src/services/tripAnchorHelpers.ts src/services/__tests__/tripAnchorHelpers.test.ts
git commit -m "feat: trip anchor helpers — haversine, plausibility, auto-location resolution (TDD)"
```

---

### Task 3: Provenance in `resolveLocationEdit` (TDD)

**Files:**
- Modify: `src/services/locationHelpers.ts`
- Modify: `src/services/__tests__/locationHelpers.test.ts`
- Modify: `src/components/NoteCaptureSheet.tsx:222` (call site — minimal)
- Modify: `src/components/NoteEditSheet.tsx:112` (call site — minimal)

`LocationPatch` gains `location_source`; `resolveLocationEdit` assigns it: untouched → pass through the auto patch's source; edited non-empty → `'manual'` (geocode success or failure alike — the label is still the user's); cleared → `null`.

- [ ] **Step 1: Update existing tests and add provenance cases**

In `src/services/__tests__/locationHelpers.test.ts`, the shared `auto` fixture gains `location_source` (use `'gps'`), and expected patches gain the field. Add these cases:

```typescript
it('passes the auto source through when not edited', () => {
  expect(
    resolveLocationEdit({ text: 'x', wasEdited: false, auto: { ...auto, location_source: 'exif' }, geocoded: null, reverseCity: null }).location_source,
  ).toBe('exif');
});

it('marks an edited, geocoded location as manual', () => {
  expect(
    resolveLocationEdit({
      text: 'Paris', wasEdited: true, auto,
      geocoded: { lat: 48.85, lng: 2.35 }, reverseCity: 'Paris',
    }).location_source,
  ).toBe('manual');
});

it('marks an edited location as manual even when geocoding fails', () => {
  expect(
    resolveLocationEdit({ text: 'Paris', wasEdited: true, auto, geocoded: null, reverseCity: null }).location_source,
  ).toBe('manual');
});

it('clears the source when the field is cleared', () => {
  expect(
    resolveLocationEdit({ text: '  ', wasEdited: true, auto, geocoded: null, reverseCity: null }).location_source,
  ).toBeNull();
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx jest src/services/__tests__/locationHelpers.test.ts`
Expected: FAIL — `location_source` missing from `LocationPatch` / returned patches.

- [ ] **Step 3: Implement**

In `src/services/locationHelpers.ts`:

```typescript
export type LocationPatch = {
  lat: number | null;
  lng: number | null;
  city: string | null;
  place_name: string | null;
  location_source: LocationSource | null;
};
```

and in `resolveLocationEdit` (structure unchanged):

```typescript
export function resolveLocationEdit(input: ResolveLocationEditInput): LocationPatch {
  const { text, wasEdited, auto, geocoded, reverseCity } = input;

  if (!wasEdited) return auto;

  const place = text.trim();
  if (place.length === 0) {
    return { lat: null, lng: null, city: null, place_name: null, location_source: null };
  }

  if (geocoded) {
    return {
      lat: geocoded.lat,
      lng: geocoded.lng,
      city: reverseCity ?? place,
      place_name: place,
      location_source: 'manual',
    };
  }

  // Geocode failed/offline: keep the label, drop the bad pin.
  return { lat: null, lng: null, city: null, place_name: place, location_source: 'manual' };
}
```

- [ ] **Step 4: Update the two call sites so tsc stays green (minimal, refined later)**

`NoteCaptureSheet.tsx` `handleSave` — the `auto:` object (line ~222) gains a source (full inference replaces this in Task 6):

```typescript
        auto: {
          lat: autoLat,
          lng: autoLng,
          city: autoCity,
          place_name: autoPlaceName,
          location_source: exifLocation ? 'exif' : autoLat !== null ? 'gps' : null,
        },
```

`NoteEditSheet.tsx` (line ~112) — the existing note's source passes through:

```typescript
        auto: { lat: note.lat, lng: note.lng, city: note.city, place_name: note.place_name, location_source: note.location_source },
```

- [ ] **Step 5: Run full suite and commit**

```bash
npx tsc --noEmit && npx jest
git add src/services/locationHelpers.ts src/services/__tests__/locationHelpers.test.ts src/components/NoteCaptureSheet.tsx src/components/NoteEditSheet.tsx
git commit -m "feat: location edit resolution carries provenance (manual/cleared/auto pass-through)"
```

---

### Task 4: Thread `location_source` through queue + noteService

**Files:**
- Modify: `src/services/offlineQueue.ts:6-19` (`PendingNote`)
- Modify: `src/services/noteService.ts` (`CreateNoteInput`, `createNote`, `drainQueue`, `UpdateNoteInput`, `updateNote`)
- Modify: `src/components/NoteCaptureSheet.tsx` (`createNote` call)
- Modify: `src/components/NoteEditSheet.tsx` (`updateNote` call)
- Test: `src/components/__tests__/NoteEditSheet.test.tsx` (extend location describe)

Mirrors exactly how `place_name` was threaded (see git history of `place_name` plumbing).

- [ ] **Step 1: Write the failing test (NoteEditSheet writes `'manual'`)**

In `src/components/__tests__/NoteEditSheet.test.tsx`, `NoteEditSheet — editable location` describe: add `location_source: 'gps'` to the `locatedNote` fixture, then:

- in *"pre-fills the field…preserves location when untouched"*: add `location_source: 'gps'` to the `expect.objectContaining` patch.
- in *"geocodes an edited location…"*: add `location_source: 'manual'` to the `expect.objectContaining` patch.
- in *"drops the pin when geocoding…fails"*: add `location_source: 'manual'` to the `expect.objectContaining` patch.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/components/__tests__/NoteEditSheet.test.tsx`
Expected: FAIL — `updateNote` patch has no `location_source` (the sheet doesn't pass it yet).

- [ ] **Step 3: Implement the plumbing**

`src/services/offlineQueue.ts` — `PendingNote` gains (after `place_name`):

```typescript
  location_source: LocationSource | null;
```

with `import type { LocationSource } from './locationHelpers';` added to the imports.

`src/services/noteService.ts`:

```typescript
import type { LocationSource } from './locationHelpers';

export type CreateNoteInput = {
  // ...existing fields unchanged...
  location_source?: LocationSource | null;
};
```

In `createNote`, the `pending` literal gains (after `place_name`):

```typescript
    location_source: input.location_source ?? null,
```

In `drainQueue`, the `row` literal gains (after `place_name`):

```typescript
      location_source: item.location_source ?? null,
```

`UpdateNoteInput` gains:

```typescript
  location_source: LocationSource | null;
```

and `updateNote`'s update object gains:

```typescript
      location_source: patch.location_source,
```

`src/components/NoteCaptureSheet.tsx` — `createNote` call gains:

```typescript
        location_source: locPatch.location_source,
```

`src/components/NoteEditSheet.tsx` — `updateNote` call gains:

```typescript
        location_source: locPatch.location_source,
```

- [ ] **Step 4: Run the suite**

Run: `npx tsc --noEmit && npx jest`
Expected: PASS. (If `noteService.test.ts` or `offlineQueue.test.ts` construct `PendingNote` literals, add `location_source: null` to those fixtures.)

- [ ] **Step 5: Commit**

```bash
git add src/services/offlineQueue.ts src/services/noteService.ts src/components/NoteCaptureSheet.tsx src/components/NoteEditSheet.tsx src/components/__tests__/NoteEditSheet.test.tsx src/services/__tests__
git commit -m "feat: thread location_source through capture queue, drain, and note updates"
```

---

### Task 5: `tripAnchorService` — fetch + geocode + memoize anchors (TDD)

**Files:**
- Create: `src/services/tripAnchorService.ts`
- Test: `src/services/__tests__/tripAnchorService.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
const mockSingle = jest.fn();
const mockTripsSelect = jest.fn();

function makeNotesQuery(result: { data: unknown[] | null; error: unknown }) {
  const builder: any = {
    eq: jest.fn(() => builder),
    in: jest.fn(() => builder),
    not: jest.fn(() => builder),
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  };
  return builder;
}

const mockNotesSelect = jest.fn();
const mockFrom = jest.fn((table: string) =>
  table === 'trips' ? { select: mockTripsSelect } : { select: mockNotesSelect },
);

jest.mock('../../lib/supabase', () => ({
  supabase: { from: (table: string) => mockFrom(table) },
}));

const mockGeocode = jest.fn();
jest.mock('../../services/locationService', () => ({
  geocodeLocation: (...a: unknown[]) => mockGeocode(...a),
}));

import { getTripAnchors, clearAnchorCache } from '../tripAnchorService';

function mockTrip(destinations: string[] | null) {
  mockTripsSelect.mockReturnValue({
    eq: jest.fn(() => ({ single: mockSingle })),
  });
  mockSingle.mockResolvedValue({ data: destinations === null ? null : { destinations }, error: null });
}

beforeEach(() => {
  jest.clearAllMocks();
  clearAnchorCache();
  mockNotesSelect.mockReturnValue(makeNotesQuery({ data: [], error: null }));
});

describe('getTripAnchors', () => {
  it('geocodes each destination into an anchor', async () => {
    mockTrip(['Paris', 'Nice']);
    mockGeocode
      .mockResolvedValueOnce({ lat: 48.85, lng: 2.35 })
      .mockResolvedValueOnce({ lat: 43.7, lng: 7.27 });

    await expect(getTripAnchors('trip-1')).resolves.toEqual([
      { lat: 48.85, lng: 2.35 },
      { lat: 43.7, lng: 7.27 },
    ]);
    expect(mockGeocode).toHaveBeenCalledWith('Paris');
    expect(mockGeocode).toHaveBeenCalledWith('Nice');
  });

  it('skips destinations that fail to geocode', async () => {
    mockTrip(['Paris', 'Atlantis']);
    mockGeocode
      .mockResolvedValueOnce({ lat: 48.85, lng: 2.35 })
      .mockResolvedValueOnce(null);

    await expect(getTripAnchors('trip-1')).resolves.toEqual([{ lat: 48.85, lng: 2.35 }]);
  });

  it('includes trusted (exif/manual) note coordinates as anchors', async () => {
    mockTrip([]);
    mockNotesSelect.mockReturnValue(
      makeNotesQuery({ data: [{ lat: 48.8, lng: 2.29 }, { lat: 48.86, lng: 2.34 }], error: null }),
    );

    await expect(getTripAnchors('trip-1')).resolves.toEqual([
      { lat: 48.8, lng: 2.29 },
      { lat: 48.86, lng: 2.34 },
    ]);
  });

  it('returns [] when there are no destinations and no trusted notes', async () => {
    mockTrip([]);
    await expect(getTripAnchors('trip-1')).resolves.toEqual([]);
  });

  it('memoizes non-empty results per trip (one fetch for two calls)', async () => {
    mockTrip(['Paris']);
    mockGeocode.mockResolvedValueOnce({ lat: 48.85, lng: 2.35 });

    await getTripAnchors('trip-1');
    await getTripAnchors('trip-1');

    expect(mockFrom).toHaveBeenCalledTimes(2); // trips + notes, once each
  });

  it('does NOT cache an empty result (offline retry stays possible)', async () => {
    mockTrip(['Paris']);
    mockGeocode.mockResolvedValueOnce(null); // offline

    await expect(getTripAnchors('trip-1')).resolves.toEqual([]);

    mockTrip(['Paris']);
    mockGeocode.mockResolvedValueOnce({ lat: 48.85, lng: 2.35 });
    await expect(getTripAnchors('trip-1')).resolves.toEqual([{ lat: 48.85, lng: 2.35 }]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/services/__tests__/tripAnchorService.test.ts`
Expected: FAIL — cannot find module `../tripAnchorService`.

- [ ] **Step 3: Implement `tripAnchorService.ts`**

```typescript
import { supabase } from '../lib/supabase';
import { geocodeLocation } from './locationService';
import type { AnchorPoint } from './tripAnchorHelpers';

/**
 * Anchors for a trip: geocoded `trips.destinations` entries plus the
 * coordinates of trusted notes (location_source 'exif' or 'manual').
 * Untrusted ('gps'/null) notes are deliberately excluded — otherwise an
 * existing wrong-location note would vouch for future wrong GPS fixes.
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/services/__tests__/tripAnchorService.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit
git add src/services/tripAnchorService.ts src/services/__tests__/tripAnchorService.test.ts
git commit -m "feat: tripAnchorService — destination geocoding + trusted-note anchors, memoized (TDD)"
```

---

### Task 6: Capture-time inference in `NoteCaptureSheet`

**Files:**
- Modify: `src/components/NoteCaptureSheet.tsx`

The plausibility check runs as soon as the GPS fix and selected trip are known — the location pill shows the inferred city *before* save, and `handleSave` writes the same thing (re-checking the fresh fix it fetches).

- [ ] **Step 1: Add imports and anchor state**

New imports (extend the existing import lines from these modules):

```typescript
import { isPlausible, nearestAnchor, resolveAutoLocation } from '../services/tripAnchorHelpers';
import type { AnchorPoint } from '../services/tripAnchorHelpers';
import { getTripAnchors } from '../services/tripAnchorService';
import type { LocationPatch } from '../services/locationHelpers';
```

New state + effects, after the `exifPlace` reverse-geocode effect (line ~110):

```typescript
  // Trip anchors for GPS plausibility (destinations + trusted notes).
  const [anchors, setAnchors] = useState<AnchorPoint[]>([]);
  useEffect(() => {
    if (!visible || !selectedTripId) { setAnchors([]); return; }
    let cancelled = false;
    getTripAnchors(selectedTripId)
      .then((result) => { if (!cancelled) setAnchors(result); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [visible, selectedTripId]);

  // When the live GPS fix is implausible for the trip (and there's no EXIF),
  // the nearest anchor becomes the effective auto location.
  const inferredAnchor = useMemo(() => {
    if (exifLocation || !fix) return null;
    const point = { lat: fix.lat, lng: fix.lng };
    if (isPlausible(point, anchors)) return null;
    return nearestAnchor(point, anchors);
  }, [exifLocation, fix, anchors]);

  const [anchorPlace, setAnchorPlace] = useState<{ city: string | null; placeName: string | null } | null>(null);
  useEffect(() => {
    if (!inferredAnchor) { setAnchorPlace(null); return; }
    let cancelled = false;
    reverseGeocodePlace(inferredAnchor.lat, inferredAnchor.lng)
      .then((result) => { if (!cancelled) setAnchorPlace(result); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [inferredAnchor]);
```

- [ ] **Step 2: Make the pill show the inferred city**

Replace line 172:

```typescript
  const displayCity = exifPlace?.city ?? (locating ? null : fix?.city ?? null);
```

with:

```typescript
  const displayCity =
    exifPlace?.city ??
    (inferredAnchor ? anchorPlace?.city ?? null : locating ? null : fix?.city ?? null);
```

- [ ] **Step 3: Replace the auto-location block in `handleSave`**

Replace the current block (lines ~206–225, from `// Determine auto location` through the `resolveLocationEdit` call) with:

```typescript
      // Determine auto location: EXIF wins; otherwise GPS is plausibility-checked
      // against the trip anchors and replaced by the nearest anchor if it looks
      // wrong for this trip (e.g. editing a Paris trip from home).
      const latest = await fetchLocation();
      const gpsFix = latest ?? fix;
      const auto = resolveAutoLocation(
        exifLocation
          ? { lat: exifLocation.lat, lng: exifLocation.lng, city: exifPlace?.city ?? null, placeName: exifPlace?.placeName ?? null }
          : null,
        gpsFix
          ? { lat: gpsFix.lat, lng: gpsFix.lng, city: gpsFix.city, placeName: gpsFix.placeName }
          : null,
        anchors,
      );

      let autoPatch: LocationPatch;
      if (auto.source === 'inferred') {
        const place = anchorPlace ?? (await reverseGeocodePlace(auto.anchor.lat, auto.anchor.lng));
        autoPatch = {
          lat: auto.anchor.lat,
          lng: auto.anchor.lng,
          city: place.city,
          place_name: place.placeName,
          location_source: 'inferred',
        };
      } else if (auto.source === null) {
        autoPatch = { lat: null, lng: null, city: null, place_name: null, location_source: null };
      } else {
        autoPatch = {
          lat: auto.lat,
          lng: auto.lng,
          city: auto.city,
          place_name: auto.place_name,
          location_source: auto.source,
        };
      }

      // Apply any manual location edit on top of the auto result
      const geocoded = locationEdited ? await geocodeLocation(location) : null;
      const revCity =
        locationEdited && geocoded ? await reverseCity(geocoded.lat, geocoded.lng) : null;
      const locPatch = resolveLocationEdit({
        text: location,
        wasEdited: locationEdited,
        auto: autoPatch,
        geocoded,
        reverseCity: revCity,
      });
```

(The `createNote` call already passes `location_source: locPatch.location_source` from Task 4. The old `autoLat`/`autoLng`/`autoCity`/`autoPlaceName` consts are deleted.)

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npx jest`
Expected: clean + all tests pass. The branching logic itself is covered by the `resolveAutoLocation` tests from Task 2; this task is wiring.

- [ ] **Step 5: Commit**

```bash
git add src/components/NoteCaptureSheet.tsx
git commit -m "feat: capture sheet infers trip location when device GPS is implausible"
```

---

### Task 7: Launch-time sweep — `locationSweepService` (TDD) + MainStack wiring

**Files:**
- Create: `src/services/locationSweepService.ts`
- Test: `src/services/__tests__/locationSweepService.test.ts`
- Modify: `src/navigation/MainStack.tsx:31-34`

- [ ] **Step 1: Write the failing tests**

```typescript
const mockNoteEq = jest.fn();
const mockNoteUpdate = jest.fn(() => ({ eq: mockNoteEq }));

function makeQuery(result: { data: unknown[] | null; error: unknown }) {
  const builder: any = {
    eq: jest.fn(() => builder),
    not: jest.fn(() => builder),
    or: jest.fn(() => builder),
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  };
  return builder;
}

const mockTripsSelect = jest.fn();
const mockNotesSelect = jest.fn();
const mockFrom = jest.fn((table: string) =>
  table === 'trips'
    ? { select: mockTripsSelect }
    : { select: mockNotesSelect, update: mockNoteUpdate },
);

jest.mock('../../lib/supabase', () => ({
  supabase: { from: (table: string) => mockFrom(table) },
}));

const mockGetTripAnchors = jest.fn();
jest.mock('../../services/tripAnchorService', () => ({
  getTripAnchors: (...a: unknown[]) => mockGetTripAnchors(...a),
}));

const mockReverseGeocodePlace = jest.fn();
jest.mock('../../services/locationService', () => ({
  reverseGeocodePlace: (...a: unknown[]) => mockReverseGeocodePlace(...a),
}));

import { sweepNoteLocations } from '../locationSweepService';

const PARIS = { lat: 48.8566, lng: 2.3522 };
const MTV = { lat: 37.3861, lng: -122.0839 };

beforeEach(() => {
  jest.clearAllMocks();
  mockNoteEq.mockResolvedValue({ error: null });
  mockReverseGeocodePlace.mockResolvedValue({ city: 'Paris', placeName: 'Paris' });
});

describe('sweepNoteLocations', () => {
  it('rewrites an outlier gps/null note to the nearest anchor as inferred', async () => {
    mockTripsSelect.mockReturnValue(makeQuery({ data: [{ id: 'trip-1' }], error: null }));
    mockGetTripAnchors.mockResolvedValue([PARIS]);
    mockNotesSelect.mockReturnValue(
      makeQuery({ data: [{ id: 'n1', lat: MTV.lat, lng: MTV.lng, location_source: null }], error: null }),
    );

    await expect(sweepNoteLocations('user-1')).resolves.toBe(1);

    expect(mockReverseGeocodePlace).toHaveBeenCalledWith(PARIS.lat, PARIS.lng);
    expect(mockNoteUpdate).toHaveBeenCalledWith({
      lat: PARIS.lat,
      lng: PARIS.lng,
      city: 'Paris',
      place_name: 'Paris',
      location_source: 'inferred',
    });
    expect(mockNoteEq).toHaveBeenCalledWith('id', 'n1');
  });

  it('upgrades a plausible null-source note to gps without touching coordinates', async () => {
    mockTripsSelect.mockReturnValue(makeQuery({ data: [{ id: 'trip-1' }], error: null }));
    mockGetTripAnchors.mockResolvedValue([PARIS]);
    mockNotesSelect.mockReturnValue(
      makeQuery({ data: [{ id: 'n1', lat: 48.85, lng: 2.35, location_source: null }], error: null }),
    );

    await expect(sweepNoteLocations('user-1')).resolves.toBe(0);

    expect(mockNoteUpdate).toHaveBeenCalledWith({ location_source: 'gps' });
    expect(mockNoteEq).toHaveBeenCalledWith('id', 'n1');
  });

  it('leaves a plausible gps-source note completely alone', async () => {
    mockTripsSelect.mockReturnValue(makeQuery({ data: [{ id: 'trip-1' }], error: null }));
    mockGetTripAnchors.mockResolvedValue([PARIS]);
    mockNotesSelect.mockReturnValue(
      makeQuery({ data: [{ id: 'n1', lat: 48.85, lng: 2.35, location_source: 'gps' }], error: null }),
    );

    await expect(sweepNoteLocations('user-1')).resolves.toBe(0);
    expect(mockNoteUpdate).not.toHaveBeenCalled();
  });

  it('skips trips with no anchors entirely', async () => {
    mockTripsSelect.mockReturnValue(makeQuery({ data: [{ id: 'trip-1' }], error: null }));
    mockGetTripAnchors.mockResolvedValue([]);

    await expect(sweepNoteLocations('user-1')).resolves.toBe(0);
    expect(mockNotesSelect).not.toHaveBeenCalled();
  });

  it('does not count a note whose update fails (retried next launch)', async () => {
    mockTripsSelect.mockReturnValue(makeQuery({ data: [{ id: 'trip-1' }], error: null }));
    mockGetTripAnchors.mockResolvedValue([PARIS]);
    mockNotesSelect.mockReturnValue(
      makeQuery({ data: [{ id: 'n1', lat: MTV.lat, lng: MTV.lng, location_source: 'gps' }], error: null }),
    );
    mockNoteEq.mockResolvedValueOnce({ error: new Error('write failed') });

    await expect(sweepNoteLocations('user-1')).resolves.toBe(0);
  });

  it('returns 0 on a trips query error', async () => {
    mockTripsSelect.mockReturnValue(makeQuery({ data: null, error: new Error('boom') }));
    await expect(sweepNoteLocations('user-1')).resolves.toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/services/__tests__/locationSweepService.test.ts`
Expected: FAIL — cannot find module `../locationSweepService`.

- [ ] **Step 3: Implement `locationSweepService.ts`**

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/services/__tests__/locationSweepService.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Wire into `MainStack` (sweep before backfill)**

In `src/navigation/MainStack.tsx`, add the import:

```typescript
import { sweepNoteLocations } from '../services/locationSweepService';
```

and replace the backfill effect (lines 31–34):

```typescript
  useEffect(() => {
    if (!userId) return;
    // Sweep first: never spend geocodes resolving place names for coordinates
    // the sweep is about to rewrite.
    void (async () => {
      await sweepNoteLocations(userId);
      await backfillPlaceNames(userId);
    })();
  }, [userId]);
```

- [ ] **Step 6: Full verification and commit**

```bash
npx tsc --noEmit && npx jest
git add src/services/locationSweepService.ts src/services/__tests__/locationSweepService.test.ts src/navigation/MainStack.tsx
git commit -m "feat: launch-time sweep corrects implausible note locations to trip anchors"
```

---

### Task 8: Final verification, docs, PR

**Files:**
- Modify: `docs/progress.md` (status line + backlog table + feature summary)

- [ ] **Step 1: Full suite + typecheck**

```bash
npx tsc --noEmit && npx jest
```

Expected: clean, all tests pass (~260: 234 baseline + ~25 new).

- [ ] **Step 2: On-device QA checklist (user runs the app: `npm run ios -- --device`)**

- Capture a no-photo note on the France trip while at home → location pill and saved note show a France anchor city (not Mountain View); note's `location_source` is `inferred`.
- Capture a note with a geotagged photo → EXIF location used, `location_source` = `exif`.
- Manually edit a location in capture and in edit sheet → typed value wins, `location_source` = `manual`; relaunch app → sweep does not touch it.
- First launch after install → sweep corrects the known wrong France-trip notes; second launch → no further writes (check Supabase `location_source` values).

- [ ] **Step 3: Update `docs/progress.md`**

Update the **Status** line (feature merged/in-QA), add a short feature summary section (pattern: the `place_name` resolution entry), and mark **Trip-aware location inference** done in the Backlog table and in the priority memory.

- [ ] **Step 4: Push and open PR**

```bash
git push -u origin feature/trip-aware-location-inference
gh pr create --title "Trip-aware location inference" --body "$(cat <<'EOF'
## Summary
- New notes.location_source provenance column ('gps'/'exif'/'manual'/'inferred', migration 011)
- Capture sheet checks device GPS against trip anchors (geocoded trips.destinations + trusted notes) and silently substitutes the nearest anchor when implausible (>200 km from every anchor)
- Launch-time sweep corrects existing 'gps'/legacy notes the same way; 'exif'/'manual' never touched
- Spec: docs/superpowers/specs/2026-06-10-trip-aware-location-inference-design.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review Notes (done at plan time)

- **Spec coverage:** migration §1 → Task 1; anchor model §2 → Task 2; service §3 → Task 5; capture flow §4 → Tasks 3, 4, 6; sweep §5 → Task 7; testing → embedded per task + Task 8 QA. Accepted risk + error handling are encoded in the trust rules and the no-anchor/empty-cache behavior.
- **Type consistency:** `LocationSource` lives in `locationHelpers.ts` (Task 1) and is consumed by `LocationPatch` (Task 3), `PendingNote`/`CreateNoteInput`/`UpdateNoteInput` (Task 4), and `noteHelpers.Note` (Task 1). `AnchorPoint`/`AutoFix`/`AutoLocation` live in `tripAnchorHelpers.ts` (Task 2) and are consumed by Tasks 5–7.
- **Ordering constraint:** Tasks must run in order — Task 3's call-site edits depend on Task 1's `Note.location_source`; Task 6 replaces Task 3's interim source assignment.
