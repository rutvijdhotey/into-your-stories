# Smarter `place_name` Resolution + Backfill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `place_name` a real, specific location label (POI/street, falling back through city/subregion/region) derived automatically from GPS/EXIF on every new note, and backfill it onto existing notes that only have `lat`/`lng`.

**Architecture:** A new `reverseGeocodePlace(lat, lng)` helper in `src/services/locationService.ts` does one `reverseGeocodeAsync` call and returns both `city` and `placeName` (placeName is always at least as specific as city). `LocationFix` (from `getCurrentLocation`) gains `placeName`. `NoteCaptureSheet`'s EXIF-coords reverse-geocode effect is updated to capture `placeName` too, and the `auto` patch passed to `resolveLocationEdit` in `handleSave` sets `place_name` to the resolved value (was hardcoded `null`) — manual edits are unchanged. A new `placeBackfillService.ts` queries the current user's notes where `place_name IS NULL AND lat/lng IS NOT NULL`, resolves each via `reverseGeocodePlace` in small batches with a short delay, and writes back `place_name` (and `city` if it was null). It runs once on app launch from `MainStack`, gated on having a `userId`.

**Tech Stack:** TypeScript, React Native, Supabase (Postgres — no migration needed, `place_name` column already exists), `expo-location` (`reverseGeocodeAsync`, already used elsewhere)

---

### Task 1: Add `reverseGeocodePlace` to `locationService.ts` and use it in `getCurrentLocation`

**Files:**
- Modify: `src/services/locationService.ts`
- Modify: `src/services/__tests__/locationService.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/services/__tests__/locationService.test.ts`, after the existing `reverseCity` tests (before the final blank line):

```ts
test('reverseGeocodePlace returns city and a more specific placeName from name', async () => {
  mockReverse.mockResolvedValue([
    { name: 'Eiffel Tower', street: 'Champ de Mars', city: 'Paris', subregion: null, region: 'Île-de-France' },
  ]);
  await expect(reverseGeocodePlace(48.8584, 2.2945)).resolves.toEqual({
    city: 'Paris',
    placeName: 'Eiffel Tower',
  });
});

test('reverseGeocodePlace falls back placeName through street then city/subregion/region', async () => {
  mockReverse.mockResolvedValue([
    { name: null, street: 'Rue de Rivoli', city: 'Paris', subregion: null, region: 'Île-de-France' },
  ]);
  await expect(reverseGeocodePlace(48.86, 2.34)).resolves.toEqual({
    city: 'Paris',
    placeName: 'Rue de Rivoli',
  });
});

test('reverseGeocodePlace placeName falls back to city when no name/street', async () => {
  mockReverse.mockResolvedValue([
    { name: null, street: null, city: 'Kyoto', subregion: null, region: 'Kyoto Prefecture' },
  ]);
  await expect(reverseGeocodePlace(35.0, 135.77)).resolves.toEqual({
    city: 'Kyoto',
    placeName: 'Kyoto',
  });
});

test('reverseGeocodePlace derives city from subregion/region when city is null', async () => {
  mockReverse.mockResolvedValue([
    { name: null, street: null, city: null, subregion: 'Shibuya', region: 'Tokyo' },
  ]);
  await expect(reverseGeocodePlace(35.66, 139.7)).resolves.toEqual({
    city: 'Shibuya',
    placeName: 'Shibuya',
  });
});

test('reverseGeocodePlace returns nulls when there are no results', async () => {
  mockReverse.mockResolvedValue([]);
  await expect(reverseGeocodePlace(0, 0)).resolves.toEqual({ city: null, placeName: null });
});

test('reverseGeocodePlace returns nulls when expo throws', async () => {
  mockReverse.mockRejectedValue(new Error('offline'));
  await expect(reverseGeocodePlace(1, 2)).resolves.toEqual({ city: null, placeName: null });
});
```

Update the import line at the top of the test file:

```ts
import { geocodeLocation, reverseCity, reverseGeocodePlace } from '../locationService';
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd "/Users/rutvijdhotey/Documents/Personal Projects/Into Your Stories"
npx jest src/services/__tests__/locationService.test.ts --no-coverage 2>&1 | tail -20
```

Expected: FAIL — `reverseGeocodePlace is not a function`.

- [ ] **Step 3: Implement `reverseGeocodePlace` and update `getCurrentLocation`/`LocationFix`**

In `src/services/locationService.ts`, replace the entire file contents with:

```ts
import * as Location from 'expo-location';

export type LocationFix = {
  lat: number;
  lng: number;
  city: string | null;
  placeName: string | null;
};

export async function getCurrentLocation(): Promise<LocationFix | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;

    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    const { city, placeName } = await reverseGeocodePlace(lat, lng);
    return { lat, lng, city, placeName };
  } catch {
    return null;
  }
}

/**
 * Reverse-geocode coordinates to a city and a more specific place name.
 * `placeName` is always at least as specific as `city` (often a POI/street),
 * falling back through name -> street -> city -> subregion -> region.
 */
export async function reverseGeocodePlace(
  lat: number,
  lng: number,
): Promise<{ city: string | null; placeName: string | null }> {
  try {
    const results = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    if (!results.length) return { city: null, placeName: null };
    const r = results[0];
    const city = r.city ?? r.subregion ?? r.region ?? null;
    const placeName = r.name ?? r.street ?? city ?? r.subregion ?? r.region ?? null;
    return { city, placeName };
  } catch {
    return { city: null, placeName: null };
  }
}

/** Forward-geocode free text to coordinates. Returns null on empty/no-result/error. */
export async function geocodeLocation(
  text: string,
): Promise<{ lat: number; lng: number } | null> {
  const query = text.trim();
  if (query.length === 0) return null;
  try {
    const [hit] = await Location.geocodeAsync(query);
    if (!hit) return null;
    return { lat: hit.latitude, lng: hit.longitude };
  } catch {
    return null;
  }
}

/** Reverse-geocode coordinates to a city/district name. Returns null on no-result/error. */
export async function reverseCity(lat: number, lng: number): Promise<string | null> {
  try {
    const [geo] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    return geo?.city ?? geo?.district ?? null;
  } catch {
    return null;
  }
}
```

This removes `reverseGeocodeCity` (now superseded by `reverseGeocodePlace`, which `getCurrentLocation` uses instead) and adds `placeName` to `LocationFix`.

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest src/services/__tests__/locationService.test.ts --no-coverage 2>&1 | tail -15
```

Expected: PASS (all tests green, including the 6 new ones).

- [ ] **Step 5: Run full type-check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors. (Confirms `reverseGeocodeCity` had no other call sites.)

- [ ] **Step 6: Commit**

```bash
git add src/services/locationService.ts src/services/__tests__/locationService.test.ts
git commit -m "feat: add reverseGeocodePlace returning city + specific place name"
```

---

### Task 2: Use `reverseGeocodePlace` for EXIF coords and pass `place_name` from auto location in `NoteCaptureSheet`

**Files:**
- Modify: `src/components/NoteCaptureSheet.tsx`

No new test file — `NoteCaptureSheet` has no existing test file (pure UI wiring), consistent with how Task 5 of the EXIF-date plan handled this component. Correctness is verified by `tsc` plus the on-device manual checklist in the Wrap-up section.

- [ ] **Step 1: Replace the `exifCity` state with an `exifPlace` state holding both city and place name**

In `src/components/NoteCaptureSheet.tsx`, change the import (around line 33):

```ts
import { geocodeLocation, reverseCity, reverseGeocodePlace } from '../services/locationService';
```

Replace the `exifCity` state declaration (line 66):

```ts
  const [exifPlace, setExifPlace] = useState<{ city: string | null; placeName: string | null } | null>(null);
```

- [ ] **Step 2: Update the EXIF reverse-geocode effect**

Replace the effect at lines 102–111:

```ts
  useEffect(() => {
    if (!exifLocation) { setExifPlace(null); return; }
    let cancelled = false;
    reverseGeocodePlace(exifLocation.lat, exifLocation.lng)
      .then((result) => {
        if (!cancelled) setExifPlace(result);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [exifLocation]);
```

This drops the now-unused `import * as Location from 'expo-location'` if nothing else in the file uses `Location`. Check first:

```bash
grep -n "Location\." "/Users/rutvijdhotey/Documents/Personal Projects/Into Your Stories/src/components/NoteCaptureSheet.tsx"
```

If the only remaining match is the import line itself, remove the `import * as Location from 'expo-location';` line (line 19). If there are other usages, leave the import in place.

- [ ] **Step 3: Update `displayCity` and the resets in the visibility effect**

Replace line 173:

```ts
  const displayCity = exifPlace?.city ?? (locating ? null : fix?.city ?? null);
```

In the sheet-open reset effect (around line 159), replace:

```ts
    setExifCity(null);
```

with:

```ts
    setExifPlace(null);
```

- [ ] **Step 4: Pass resolved `place_name` in `handleSave`'s auto patch**

Replace lines 209–223 (the location-resolution block in `handleSave`):

```ts
      const latest = await fetchLocation();
      const autoLat = exifLocation ? exifLocation.lat : (latest?.lat ?? fix?.lat ?? null);
      const autoLng = exifLocation ? exifLocation.lng : (latest?.lng ?? fix?.lng ?? null);
      const autoCity = exifLocation ? (exifPlace?.city ?? null) : (latest?.city ?? fix?.city ?? null);
      const autoPlaceName = exifLocation
        ? (exifPlace?.placeName ?? null)
        : (latest?.placeName ?? fix?.placeName ?? null);

      // Apply any manual location edit on top of the auto result
      const geocoded = locationEdited ? await geocodeLocation(location) : null;
      const revCity =
        locationEdited && geocoded ? await reverseCity(geocoded.lat, geocoded.lng) : null;
      const locPatch = resolveLocationEdit({
        text: location,
        wasEdited: locationEdited,
        auto: { lat: autoLat, lng: autoLng, city: autoCity, place_name: autoPlaceName },
        geocoded,
        reverseCity: revCity,
      });
```

- [ ] **Step 5: Run type-check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 6: Run full test suite**

```bash
npx jest --no-coverage 2>&1 | tail -10
```

Expected: All tests still pass (this task touches no test-covered exports beyond Task 1's `locationService` change).

- [ ] **Step 7: Commit**

```bash
git add src/components/NoteCaptureSheet.tsx
git commit -m "feat: resolve place_name from GPS/EXIF coords in NoteCaptureSheet"
```

---

### Task 3: Add `placeBackfillService.backfillPlaceNames`

**Files:**
- Create: `src/services/placeBackfillService.ts`
- Create: `src/services/__tests__/placeBackfillService.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/services/__tests__/placeBackfillService.test.ts`:

```ts
const mockEq = jest.fn();
const mockUpdate = jest.fn(() => ({ eq: mockEq }));

function makeSelectQuery(result: { data: unknown[] | null; error: unknown }) {
  const builder: any = {
    eq: jest.fn(() => builder),
    is: jest.fn(() => builder),
    not: jest.fn(() => builder),
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  };
  return builder;
}

const mockSelect = jest.fn();
const mockFrom = jest.fn((_table: string) => ({
  select: mockSelect,
  update: mockUpdate,
}));

jest.mock('../../lib/supabase', () => ({
  supabase: { from: (table: string) => mockFrom(table) },
}));

jest.mock('../../services/locationService', () => ({
  reverseGeocodePlace: jest.fn(),
}));

import { backfillPlaceNames } from '../placeBackfillService';
import { reverseGeocodePlace } from '../../services/locationService';

const mockReverseGeocodePlace = reverseGeocodePlace as jest.MockedFunction<typeof reverseGeocodePlace>;

beforeEach(() => {
  jest.clearAllMocks();
  mockEq.mockResolvedValue({ error: null });
});

describe('backfillPlaceNames', () => {
  it('returns 0 and makes no updates when there are no eligible notes', async () => {
    mockSelect.mockReturnValue(makeSelectQuery({ data: [], error: null }));

    await expect(backfillPlaceNames('user-1')).resolves.toBe(0);

    expect(mockFrom).toHaveBeenCalledWith('notes');
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('returns 0 and makes no updates on a query error', async () => {
    mockSelect.mockReturnValue(makeSelectQuery({ data: null, error: new Error('boom') }));

    await expect(backfillPlaceNames('user-1')).resolves.toBe(0);

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('resolves place_name (and city when missing) for each eligible note', async () => {
    mockSelect.mockReturnValue(
      makeSelectQuery({
        data: [
          { id: 'n1', lat: 48.85, lng: 2.35, city: 'Paris' },
          { id: 'n2', lat: 35.66, lng: 139.7, city: null },
        ],
        error: null,
      }),
    );
    mockReverseGeocodePlace
      .mockResolvedValueOnce({ city: 'Paris', placeName: 'Eiffel Tower' })
      .mockResolvedValueOnce({ city: 'Shibuya', placeName: 'Shibuya Crossing' });

    await expect(backfillPlaceNames('user-1')).resolves.toBe(2);

    expect(mockReverseGeocodePlace).toHaveBeenNthCalledWith(1, 48.85, 2.35);
    expect(mockReverseGeocodePlace).toHaveBeenNthCalledWith(2, 35.66, 139.7);
    expect(mockUpdate).toHaveBeenNthCalledWith(1, { place_name: 'Eiffel Tower', city: 'Paris' });
    expect(mockEq).toHaveBeenNthCalledWith(1, 'id', 'n1');
    expect(mockUpdate).toHaveBeenNthCalledWith(2, { place_name: 'Shibuya Crossing', city: 'Shibuya' });
    expect(mockEq).toHaveBeenNthCalledWith(2, 'id', 'n2');
  });

  it('skips a note (no update, not counted) when reverse geocoding yields no place name', async () => {
    mockSelect.mockReturnValue(
      makeSelectQuery({
        data: [{ id: 'n1', lat: 0, lng: 0, city: null }],
        error: null,
      }),
    );
    mockReverseGeocodePlace.mockResolvedValueOnce({ city: null, placeName: null });

    await expect(backfillPlaceNames('user-1')).resolves.toBe(0);

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('does not count a note whose update fails', async () => {
    mockSelect.mockReturnValue(
      makeSelectQuery({
        data: [{ id: 'n1', lat: 48.85, lng: 2.35, city: 'Paris' }],
        error: null,
      }),
    );
    mockReverseGeocodePlace.mockResolvedValueOnce({ city: 'Paris', placeName: 'Eiffel Tower' });
    mockEq.mockResolvedValueOnce({ error: new Error('write failed') });

    await expect(backfillPlaceNames('user-1')).resolves.toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest src/services/__tests__/placeBackfillService.test.ts --no-coverage 2>&1 | tail -20
```

Expected: FAIL — `Cannot find module '../placeBackfillService'`.

- [ ] **Step 3: Implement `backfillPlaceNames`**

Create `src/services/placeBackfillService.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest src/services/__tests__/placeBackfillService.test.ts --no-coverage 2>&1 | tail -15
```

Expected: PASS (all 5 tests green).

- [ ] **Step 5: Run type-check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/services/placeBackfillService.ts src/services/__tests__/placeBackfillService.test.ts
git commit -m "feat: add backfillPlaceNames to resolve place_name for existing notes"
```

---

### Task 4: Run the backfill once on app launch from `MainStack`

**Files:**
- Modify: `src/navigation/MainStack.tsx`

- [ ] **Step 1: Wire `backfillPlaceNames` into the existing launch effect**

In `src/navigation/MainStack.tsx`, add the imports:

```ts
import { useAuth } from '../contexts/AuthContext';
import { backfillPlaceNames } from '../services/placeBackfillService';
```

Inside `MainStackInner`, get the user id and run the backfill alongside the existing launch `drainAll()`:

```ts
function MainStackInner() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureAutoRecord, setCaptureAutoRecord] = useState(false);
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();

  useEffect(() => {
    void drainAll();
  }, []);

  useEffect(() => {
    if (!userId) return;
    void backfillPlaceNames(userId);
  }, [userId]);
```

(Leave the rest of the existing effects — `useOnReconnect`, the `AppState` listener, etc. — unchanged.)

- [ ] **Step 2: Run type-check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors. (Confirms `useAuth`'s `session` shape matches `session?.user.id`, as already used in `NoteCaptureSheet.tsx`.)

- [ ] **Step 3: Run full test suite**

```bash
npx jest --no-coverage 2>&1 | tail -10
```

Expected: All tests pass. `MainStack` has no dedicated test file, so no test changes are expected.

- [ ] **Step 4: Commit**

```bash
git add src/navigation/MainStack.tsx
git commit -m "feat: run place_name backfill once on app launch"
```

---

### Task 5: Final verification and progress notes

**Files:**
- Modify: `docs/progress.md`

- [ ] **Step 1: Run the full suite and type-check one more time**

```bash
npx jest --no-coverage 2>&1 | tail -15
npx tsc --noEmit 2>&1 | head -20
```

Expected: All tests pass (223 + ~11 new = ~234), `tsc` clean.

- [ ] **Step 2: Manual on-device verification checklist**

1. Capture a note with GPS on, no photos → `place_name` is set to a specific place (not just the city) — check via Supabase or the note card's 📍 line.
2. Capture a note from a photo with EXIF GPS (no live GPS override) → `place_name` resolves from the EXIF coordinates.
3. Type a manual location and save → manual text still wins as `place_name` (auto-resolution is bypassed), unchanged from before.
4. Cold-start the app with existing notes that have `lat`/`lng` but `place_name IS NULL` → within a few seconds, those notes' cards show a 📍 place name (may require pulling to refresh / re-rendering the feed, since the update happens via direct Supabase write — `useNotes`' realtime subscription should pick up the `UPDATE`).
5. Cold-start again → no errors, no duplicate work (already-backfilled notes are skipped).

- [ ] **Step 3: Update `docs/progress.md`**

In `docs/progress.md`, replace the "Note card location display" section (lines 9–20, the one starting `**Note card location display — fix done, bigger feature designed...**`) with:

```markdown
**Note card location display + smarter `place_name` resolution (DONE ✅ — branch `fix/note-card-location-display`):**

1. *Duplicate location display fix:* `NoteCard.tsx` showed location twice — `note.city` top-right next to the timestamp, and `note.place_name` below the note text with 📍. Removed `city` (and `pending.city`) from the header meta line; header now shows only the relative time. `place_name` remains the single location indicator below the text.
2. *Smarter `place_name` resolution:* `reverseGeocodePlace(lat, lng)` (`locationService.ts`) does one `reverseGeocodeAsync` call returning `{ city, placeName }`, where `city = city ?? subregion ?? region` and `placeName = name ?? street ?? city ?? subregion ?? region` (always at least as specific as city, often a POI/street). `LocationFix` (from `getCurrentLocation`) now carries `placeName`. `NoteCaptureSheet`'s EXIF-coords reverse-geocode effect now captures `placeName` alongside `city`; in `handleSave`, the `auto` patch passed to `resolveLocationEdit` sets `place_name` from the resolved value (was hardcoded `null`), falling back EXIF → live GPS like `city`/`lat`/`lng` already do. Manual edits are unchanged — typed text still wins.
3. *Backfill (existing notes):* `backfillPlaceNames(userId)` (`placeBackfillService.ts`) queries the current user's notes where `place_name IS NULL AND lat/lng IS NOT NULL`, resolves each via `reverseGeocodePlace` in batches of 5 with a short delay, and writes back `place_name` (and `city` if it was null). Runs once on app launch from `MainStack`, gated on `userId`. No new UI, no new API keys, no DB migration (`place_name` already existed). Naturally resumable/idempotent — already-backfilled notes drop out of the query.

tsc clean, full suite passing (~234 tests).
```

- [ ] **Step 4: Commit**

```bash
git add docs/progress.md
git commit -m "docs: record place_name resolution + backfill"
```

---

## Wrap-up

After all tasks are complete, push `fix/note-card-location-display` and open a PR into `main` (this branch already contains the earlier location-display dedup fix per `docs/progress.md`).

**Manual verification checklist (repeated from Task 5 for convenience):**
1. New note with live GPS → `place_name` is a specific place, not just a city.
2. New note from EXIF-only photo → `place_name` resolves from EXIF coords.
3. Manually typed location on save → still wins, unchanged.
4. Existing notes with `lat`/`lng` but no `place_name` → backfilled within a few seconds of cold start.
5. Second cold start → no duplicate work, no errors.
