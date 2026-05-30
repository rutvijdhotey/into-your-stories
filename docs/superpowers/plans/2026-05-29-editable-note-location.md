# Editable Note Location Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user type a note's location ("Paris") and have its label, map pin, and destination grouping all follow — at capture time and when editing a saved note.

**Architecture:** A shared `LocationField` input feeds a pure helper (`resolveLocationEdit`) that, on save, turns an edited location string into a `{ lat, lng, city, place_name }` patch — forward-geocoding the text for coordinates, reverse-geocoding those coords for a clean city, and dropping the pin if geocoding fails. AI tagging is taught to preserve a manually-set `place_name`.

**Tech Stack:** React Native (Expo), TypeScript, `expo-location` (already installed), Jest. No migration, no new deps.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/services/locationService.ts` (modify) | Add `geocodeLocation` (text → coords) and `reverseCity` (coords → city) wrappers around `expo-location`. |
| `src/services/locationHelpers.ts` (new, pure) | `resolveLocationEdit` — branchless-of-native logic that produces the column patch. |
| `src/services/__tests__/locationHelpers.test.ts` (new) | Unit tests for `resolveLocationEdit`. |
| `src/services/__tests__/locationService.test.ts` (new) | Unit tests for `geocodeLocation` / `reverseCity` (mock `expo-location`). |
| `src/services/taggingHelpers.ts` (modify) | `mergeTags` preserves an existing `place_name`. |
| `src/services/__tests__/taggingHelpers.test.ts` (modify) | Update the merge assertion + add a preserve case. |
| `src/services/noteService.ts` (modify) | Extend `CreateNoteInput` (+`place_name`) and `UpdateNoteInput` (+`place_name`,`lat`,`lng`,`city`); patch `updateNote`. |
| `src/components/LocationField.tsx` (new) | Shared editable "Location" pill/input. |
| `src/components/NoteCaptureSheet.tsx` (modify) | Replace read-only pill with `LocationField`; resolve location on save. |
| `src/components/NoteEditSheet.tsx` (modify) | Add `LocationField`; resolve location on save. |

---

## Task 1: `resolveLocationEdit` pure helper

**Files:**
- Create: `src/services/locationHelpers.ts`
- Test: `src/services/__tests__/locationHelpers.test.ts`

This helper owns all the save-time branching. The caller (a sheet) is responsible for the
async geocode/reverse calls and passes their *results* in. Contract:

- `wasEdited === false` → return the `auto` patch unchanged (no geocode happened).
- `wasEdited === true` and trimmed text is empty → all four fields `null`.
- `wasEdited === true`, text non-empty, `geocoded` coords present → `place_name` = trimmed
  text; `lat`/`lng` = geocoded; `city` = `reverseCity ?? trimmed text`.
- `wasEdited === true`, text non-empty, `geocoded` is `null` (failed/offline) → `place_name`
  = trimmed text; `lat`/`lng`/`city` = `null` (drop the bad pin).

- [ ] **Step 1: Write the failing test**

```typescript
// src/services/__tests__/locationHelpers.test.ts
import { resolveLocationEdit } from '../locationHelpers';

const auto = { lat: 1, lng: 2, city: 'Auto City', place_name: null };

test('not edited returns the auto patch unchanged', () => {
  expect(
    resolveLocationEdit({ text: 'whatever', wasEdited: false, auto, geocoded: null, reverseCity: null }),
  ).toEqual(auto);
});

test('edited to empty clears every field', () => {
  expect(
    resolveLocationEdit({ text: '   ', wasEdited: true, auto, geocoded: null, reverseCity: null }),
  ).toEqual({ lat: null, lng: null, city: null, place_name: null });
});

test('edited with successful geocode sets coords, typed place, reverse city', () => {
  expect(
    resolveLocationEdit({
      text: '  Paris ',
      wasEdited: true,
      auto,
      geocoded: { lat: 48.85, lng: 2.35 },
      reverseCity: 'Paris',
    }),
  ).toEqual({ lat: 48.85, lng: 2.35, city: 'Paris', place_name: 'Paris' });
});

test('edited with geocode but no reverse city falls back to typed text for city', () => {
  expect(
    resolveLocationEdit({
      text: 'Quinta da Regaleira',
      wasEdited: true,
      auto,
      geocoded: { lat: 38.79, lng: -9.39 },
      reverseCity: null,
    }),
  ).toEqual({ lat: 38.79, lng: -9.39, city: 'Quinta da Regaleira', place_name: 'Quinta da Regaleira' });
});

test('edited but geocode failed drops the pin, keeps typed place', () => {
  expect(
    resolveLocationEdit({ text: 'Paris', wasEdited: true, auto, geocoded: null, reverseCity: null }),
  ).toEqual({ lat: null, lng: null, city: null, place_name: 'Paris' });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/services/__tests__/locationHelpers.test.ts`
Expected: FAIL — "Cannot find module '../locationHelpers'".

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/services/locationHelpers.ts

export type LocationPatch = {
  lat: number | null;
  lng: number | null;
  city: string | null;
  place_name: string | null;
};

export type ResolveLocationEditInput = {
  /** Current text in the Location field. */
  text: string;
  /** Did the user actually change the field? */
  wasEdited: boolean;
  /** Patch to use when the field was not edited (auto GPS/EXIF result). */
  auto: LocationPatch;
  /** Forward-geocode result for `text`, or null if it failed/empty/offline. */
  geocoded: { lat: number; lng: number } | null;
  /** Reverse-geocoded city for `geocoded`, or null. */
  reverseCity: string | null;
};

export function resolveLocationEdit(input: ResolveLocationEditInput): LocationPatch {
  const { text, wasEdited, auto, geocoded, reverseCity } = input;

  if (!wasEdited) return auto;

  const place = text.trim();
  if (place.length === 0) {
    return { lat: null, lng: null, city: null, place_name: null };
  }

  if (geocoded) {
    return {
      lat: geocoded.lat,
      lng: geocoded.lng,
      city: reverseCity ?? place,
      place_name: place,
    };
  }

  // Geocode failed/offline: keep the label, drop the bad pin.
  return { lat: null, lng: null, city: null, place_name: place };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/services/__tests__/locationHelpers.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/locationHelpers.ts src/services/__tests__/locationHelpers.test.ts
git commit -m "feat: resolveLocationEdit pure helper for editable note location"
```

---

## Task 2: `geocodeLocation` + `reverseCity` service wrappers

**Files:**
- Modify: `src/services/locationService.ts`
- Test: `src/services/__tests__/locationService.test.ts` (new)

`expo-location` is mocked in tests. `geocodeAsync(text)` returns an array of
`{ latitude, longitude }`; `reverseGeocodeAsync({latitude,longitude})` returns an array of
geocode objects with `city` / `district`. Both wrappers must never throw — they return
`null` on empty input, empty result, or a thrown error (offline).

- [ ] **Step 1: Write the failing test**

```typescript
// src/services/__tests__/locationService.test.ts
import * as Location from 'expo-location';
import { geocodeLocation, reverseCity } from '../locationService';

jest.mock('expo-location');

const mockGeocode = Location.geocodeAsync as jest.Mock;
const mockReverse = Location.reverseGeocodeAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

test('geocodeLocation returns coords from the first hit', async () => {
  mockGeocode.mockResolvedValue([{ latitude: 48.85, longitude: 2.35 }]);
  await expect(geocodeLocation('Paris')).resolves.toEqual({ lat: 48.85, lng: 2.35 });
});

test('geocodeLocation returns null for empty input without calling expo', async () => {
  await expect(geocodeLocation('   ')).resolves.toBeNull();
  expect(mockGeocode).not.toHaveBeenCalled();
});

test('geocodeLocation returns null when no hits', async () => {
  mockGeocode.mockResolvedValue([]);
  await expect(geocodeLocation('Nowheresville')).resolves.toBeNull();
});

test('geocodeLocation returns null when expo throws (offline)', async () => {
  mockGeocode.mockRejectedValue(new Error('offline'));
  await expect(geocodeLocation('Paris')).resolves.toBeNull();
});

test('reverseCity returns city, falling back to district', async () => {
  mockReverse.mockResolvedValue([{ city: null, district: 'Shibuya' }]);
  await expect(reverseCity(35.6, 139.7)).resolves.toBe('Shibuya');
});

test('reverseCity returns null when expo throws', async () => {
  mockReverse.mockRejectedValue(new Error('offline'));
  await expect(reverseCity(1, 2)).resolves.toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/services/__tests__/locationService.test.ts`
Expected: FAIL — `geocodeLocation`/`reverseCity` are not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/services/locationService.ts` (keep existing `getCurrentLocation`):

```typescript
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

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/services/__tests__/locationService.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/locationService.ts src/services/__tests__/locationService.test.ts
git commit -m "feat: geocodeLocation + reverseCity wrappers"
```

---

## Task 3: `mergeTags` preserves a manually-set place_name

**Files:**
- Modify: `src/services/taggingHelpers.ts` (`ExistingTags` type + `mergeTags` return)
- Modify: `src/services/taggingService.ts:16-17` (the `mergeTags` call site)
- Modify: `src/services/__tests__/taggingHelpers.test.ts` (add one case)

Today `mergeTags(existing, suggestion)` returns `place_name: suggestion.place_name` — the AI
**always** wins, which would clobber a manual "Paris". `ExistingTags` currently only has
`category` and `city` (no `place_name` to compare against). Add an optional `place_name` to
`ExistingTags`, keep it when present, and pass the note's `place_name` at the call site. The
optional field means the three existing `mergeTags` tests (which pass `{ category, city }`)
still type-check and still pass — `undefined ?? suggestion.place_name` keeps the AI value
when the note has no manual place.

- [ ] **Step 1: Add a failing test for the preserve case**

Append inside the existing `describe('mergeTags', ...)` block in
`src/services/__tests__/taggingHelpers.test.ts` (do NOT touch the three existing `it(...)`
cases — they must keep passing):

```typescript
  it('preserves a manually-set place_name over the suggestion', () => {
    expect(
      mergeTags(
        { category: null, city: null, place_name: 'Paris' },
        { category: 'activity', place_name: 'Googleplex', city: 'Mountain View' },
      ),
    ).toEqual({ category: 'activity', place_name: 'Paris', city: 'Mountain View' });
  });
```

- [ ] **Step 2: Run test to verify the new case fails**

Run: `npx jest src/services/__tests__/taggingHelpers.test.ts`
Expected: FAIL on "preserves a manually-set place_name" — receives `Googleplex`.

- [ ] **Step 3: Update `ExistingTags` and `mergeTags`**

In `src/services/taggingHelpers.ts`, add `place_name` to `ExistingTags`:

```typescript
export type ExistingTags = {
  category: Category | null;
  city: string | null;
  place_name?: string | null;
};
```

and change the `place_name` line in the `mergeTags` return:

```typescript
export function mergeTags(existing: ExistingTags, suggestion: TagSuggestion): TagSuggestion {
  return {
    category: existing.category ?? suggestion.category,
    place_name: existing.place_name ?? suggestion.place_name,
    city: existing.city ?? suggestion.city,
  };
}
```

- [ ] **Step 4: Pass the note's place_name at the call site**

In `src/services/taggingService.ts`, the `mergeTags` call currently passes
`{ category: note.category, city: note.city }`. Add `place_name`:

```typescript
  const merged = mergeTags(
    { category: note.category, city: note.city, place_name: note.place_name },
    normalizeSuggestion(data),
  );
```

> Adjust the second argument to match the existing code exactly — only the first object
> changes (the added `place_name` key).

- [ ] **Step 5: Run tests to verify all pass**

Run: `npx jest src/services/__tests__/taggingHelpers.test.ts && npx tsc --noEmit`
Expected: all `taggingHelpers` cases PASS; no new type errors in `taggingService.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/services/taggingHelpers.ts src/services/taggingService.ts src/services/__tests__/taggingHelpers.test.ts
git commit -m "feat: mergeTags preserves a manually-set place_name"
```

---

## Task 4: Extend note service inputs for location

**Files:**
- Modify: `src/services/noteService.ts` (`CreateNoteInput`, `trySync`, `UpdateNoteInput`, `updateNote`)

`createNote` already accepts `lat`/`lng`/`city`; add `place_name` so a manual capture-time
place is persisted. `updateNote` currently only patches `content`/`category`/`photo_urls`;
add the four location columns. There is no unit test asserting the column set in the
existing `noteService.test.ts`, so this task is type/contract plumbing verified by `tsc` and
the sheets that consume it.

- [ ] **Step 1: Add `place_name` to `CreateNoteInput` and the `PendingNote` write**

In `src/services/noteService.ts`, add to `CreateNoteInput` (after `city`):

```typescript
  place_name?: string | null;
```

In `trySync`, add `place_name` to the `row: NoteInsert` object:

```typescript
    place_name: pending.place_name ?? null,
```

And carry it onto the `pending` object in `createNote`:

```typescript
    city: input.city,
    place_name: input.place_name ?? null,
```

> Note: `PendingNote` is exported from `src/services/offlineQueue.ts` (fields: `offline_id`,
> `user_id`, `trip_id`, `content`, `category`, `lat`, `lng`, `city`, `captured_at`). Add
> `place_name: string | null;` to `PendingNote` so the queue payload round-trips it. In
> `noteService.ts`'s `drainQueue`, the insert builds its `row` from queue items — add
> `place_name: item.place_name ?? null` there too.

- [ ] **Step 2: Extend `UpdateNoteInput` and `updateNote`**

Replace `UpdateNoteInput` and the `updateNote` body:

```typescript
export type UpdateNoteInput = {
  content: string;
  category: Category | null;
  photo_urls: string[];
  lat: number | null;
  lng: number | null;
  city: string | null;
  place_name: string | null;
};

export async function updateNote(id: string, patch: UpdateNoteInput): Promise<void> {
  const { error } = await supabase
    .from('notes')
    .update({
      content: patch.content,
      category: patch.category,
      photo_urls: patch.photo_urls,
      lat: patch.lat,
      lng: patch.lng,
      city: patch.city,
      place_name: patch.place_name,
      tagging_status: 'pending',
    })
    .eq('id', id);

  if (error) throw error;
}
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: errors ONLY in `NoteEditSheet.tsx` (it calls `updateNote` without the new
required fields — fixed in Task 6). No errors in `noteService.ts` / `offlineQueue.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/services/noteService.ts src/services/offlineQueue.ts
git commit -m "feat: note service carries place_name + editable location on update"
```

---

## Task 5: `LocationField` shared component

**Files:**
- Create: `src/components/LocationField.tsx`

A controlled text input styled like the existing location pill. Props: `value`,
`onChangeText`, optional `loading` (shows a "Locating…" placeholder while GPS resolves),
and `editable`. Mirrors the visual language of `NoteCaptureSheet`'s `locationPill` /
`input` styles (rgba surface, pill radius). No test — it's a presentational component with
no logic; behavior is covered where it's wired in.

- [ ] **Step 1: Create the component**

```tsx
// src/components/LocationField.tsx
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { Colors, Spacing, BorderRadius } from '../theme';

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  loading?: boolean;
  editable?: boolean;
};

export default function LocationField({
  value,
  onChangeText,
  loading = false,
  editable = true,
}: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.pin}>📍</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        editable={editable && !loading}
        placeholder={loading ? 'Locating…' : 'Add a location'}
        placeholderTextColor={Colors.textSecondary}
        style={styles.input}
        accessibilityLabel="Note location"
        returnKeyType="done"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: BorderRadius.pill,
    paddingVertical: 6,
    paddingHorizontal: 12,
    gap: 6,
  },
  pin: { fontSize: 12 },
  input: { flex: 1, fontSize: 12, color: Colors.textPrimary, padding: 0 },
});
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no new errors from `LocationField.tsx` (the `NoteEditSheet` error from Task 4 may
still be present until Task 6).

- [ ] **Step 3: Commit**

```bash
git add src/components/LocationField.tsx
git commit -m "feat: shared LocationField input"
```

---

## Task 6: Wire `LocationField` into `NoteEditSheet`

**Files:**
- Modify: `src/components/NoteEditSheet.tsx`

Add editable location to the existing-note edit flow. Pre-fill from `place_name ?? city`,
track edits, and resolve on save using the Task 1/2 helpers.

- [ ] **Step 1: Add imports**

At the top of `src/components/NoteEditSheet.tsx`, add:

```typescript
import LocationField from './LocationField';
import { geocodeLocation, reverseCity } from '../services/locationService';
import { resolveLocationEdit } from '../services/locationHelpers';
```

- [ ] **Step 2: Add location state + reset**

After the existing `const [category, ...]` state, add:

```typescript
  const initialLocation = note.place_name ?? note.city ?? '';
  const [location, setLocation] = useState(initialLocation);
  const [locationEdited, setLocationEdited] = useState(false);
```

In `handleShow` (resets state when the sheet opens), add:

```typescript
    setLocation(note.place_name ?? note.city ?? '');
    setLocationEdited(false);
```

Add a handler used by the field so typing flags the edit:

```typescript
  const handleLocationChange = (text: string) => {
    setLocation(text);
    setLocationEdited(true);
  };
```

- [ ] **Step 3: Resolve location inside `handleSave` and pass to `updateNote`**

In `handleSave`, after the photo upload/delete steps and before `updateNote`, compute the
patch. Replace the existing `updateNote(...)` call:

```typescript
      // 3. Resolve any manual location edit, then update note record
      const geocoded = locationEdited ? await geocodeLocation(location) : null;
      const revCity =
        locationEdited && geocoded ? await reverseCity(geocoded.lat, geocoded.lng) : null;
      const locPatch = resolveLocationEdit({
        text: location,
        wasEdited: locationEdited,
        auto: { lat: note.lat, lng: note.lng, city: note.city, place_name: note.place_name },
        geocoded,
        reverseCity: revCity,
      });

      const finalUrls = [...existingUrls, ...newUrls];
      await updateNote(note.id, {
        content: validation.value,
        category,
        photo_urls: finalUrls,
        lat: locPatch.lat,
        lng: locPatch.lng,
        city: locPatch.city,
        place_name: locPatch.place_name,
      });
```

- [ ] **Step 4: Render the field**

Add the field in the JSX after the `<CategoryPicker .../>` line:

```tsx
        <View style={{ marginHorizontal: Spacing.md, marginBottom: Spacing.sm }}>
          <LocationField value={location} onChangeText={handleLocationChange} />
        </View>
```

- [ ] **Step 5: Verify types + tests**

Run: `npx tsc --noEmit && npx jest`
Expected: no type errors; full suite green.

- [ ] **Step 6: Commit**

```bash
git add src/components/NoteEditSheet.tsx
git commit -m "feat: editable location in NoteEditSheet"
```

---

## Task 7: Wire `LocationField` into `NoteCaptureSheet`

**Files:**
- Modify: `src/components/NoteCaptureSheet.tsx`

Replace the read-only location pill with `LocationField`, pre-filled from auto-resolution,
and resolve on save. Capture's auto path (EXIF over GPS) must be unchanged when the field is
not edited.

- [ ] **Step 1: Add imports**

Add to the imports in `src/components/NoteCaptureSheet.tsx`:

```typescript
import LocationField from './LocationField';
import { geocodeLocation, reverseCity } from '../services/locationService';
import { resolveLocationEdit } from '../services/locationHelpers';
```

- [ ] **Step 2: Add location state**

After `const [exifCity, setExifCity] = useState<string | null>(null);` add:

```typescript
  const [location, setLocation] = useState('');
  const [locationEdited, setLocationEdited] = useState(false);
```

- [ ] **Step 3: Keep the field synced with auto-resolution until the user edits it**

The existing `displayCity` (`exifCity ?? fix?.city`) is the auto label. Add an effect that
fills the field from it only while the user hasn't typed. Place it after the `displayCity`
const is defined (move the `displayCity` const above this effect if needed):

```typescript
  useEffect(() => {
    if (!locationEdited) setLocation(displayCity ?? '');
  }, [displayCity, locationEdited]);
```

In the sheet-open reset effect (the one depending on `[visible, fetchLocation]`), add:

```typescript
    setLocation('');
    setLocationEdited(false);
```

Add the change handler:

```typescript
  const handleLocationChange = (text: string) => {
    setLocation(text);
    setLocationEdited(true);
  };
```

- [ ] **Step 4: Resolve location in `handleSave`**

In `handleSave`, replace the existing "Determine final location" block and the `createNote`
location fields:

```typescript
      // Determine auto location: EXIF overrides live GPS
      const latest = await fetchLocation();
      const autoLat = exifLocation ? exifLocation.lat : (latest?.lat ?? fix?.lat ?? null);
      const autoLng = exifLocation ? exifLocation.lng : (latest?.lng ?? fix?.lng ?? null);
      const autoCity = exifLocation ? exifCity : (latest?.city ?? fix?.city ?? null);

      // Apply any manual location edit on top of the auto result
      const geocoded = locationEdited ? await geocodeLocation(location) : null;
      const revCity =
        locationEdited && geocoded ? await reverseCity(geocoded.lat, geocoded.lng) : null;
      const locPatch = resolveLocationEdit({
        text: location,
        wasEdited: locationEdited,
        auto: { lat: autoLat, lng: autoLng, city: autoCity, place_name: null },
        geocoded,
        reverseCity: revCity,
      });

      await createNote({
        userId,
        tripId: selectedTripId,
        content: validation.value,
        category,
        lat: locPatch.lat,
        lng: locPatch.lng,
        city: locPatch.city,
        place_name: locPatch.place_name,
        photo_urls: uploadedUrls,
        offline_id: offlineId,
      });
```

- [ ] **Step 5: Replace the read-only pill with the field**

In the `actionRow` JSX, replace:

```tsx
          <View style={styles.locationPill}>
            <Text style={styles.locationPillText}>{locationLabel}</Text>
          </View>
```

with:

```tsx
          <View style={styles.locationFieldWrap}>
            <LocationField
              value={location}
              onChangeText={handleLocationChange}
              loading={locating && !exifCity && !locationEdited}
            />
          </View>
```

Add to the `StyleSheet.create`:

```typescript
  locationFieldWrap: { flex: 1, marginHorizontal: Spacing.sm },
```

The now-unused `locationLabel` / `locationPill` / `locationPillText` may be removed; `tsc`
with `noUnusedLocals` (if enabled) will flag `locationLabel` — delete that const and the two
orphan styles.

- [ ] **Step 6: Verify types + tests**

Run: `npx tsc --noEmit && npx jest`
Expected: no type errors; full suite green.

- [ ] **Step 7: Commit**

```bash
git add src/components/NoteCaptureSheet.tsx
git commit -m "feat: editable location field in NoteCaptureSheet"
```

---

## Task 8: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the whole suite + types**

Run: `npx tsc --noEmit && npx jest`
Expected: all tests pass (existing + ~11 new); zero type errors.

- [ ] **Step 2: Manual device/sim QA checklist** (record results)

- [ ] Capture: leave location untouched → note saves with auto GPS/EXIF city as before.
- [ ] Capture: add an edited photo that resolves to the wrong city → field shows the wrong
      city → overtype "Paris" → save → note reads "Paris", pin lands in Paris on the trip map.
- [ ] Capture: type a location while offline → saves with the typed label, no pin (no crash).
- [ ] Edit: open a saved wrong-location note → field pre-filled → change to "Paris" → save →
      feed + map reflect Paris.
- [ ] Edit: clear the location field → save → note shows no location, no map pin.
- [ ] After AI tagging runs on a manually-located note, the manual `place_name` is retained.

- [ ] **Step 3: Update progress.md**

Mark the backlog row "Editable location on note capture (QA #2)" as done; add a short
"What shipped" note referencing this plan. Commit:

```bash
git add docs/progress.md
git commit -m "docs: editable note location complete"
```

---

## Self-Review

**Spec coverage:**
- One shared `LocationField` in both sheets → Tasks 5, 6, 7. ✓
- Save behavior only acts if edited; forward-geocode → coords; reverse-geocode → city; fail → drop pin → Task 1 helper + Tasks 6/7 wiring. ✓
- `mergeTags` preserves manual `place_name` → Task 3. ✓
- `geocodeLocation` / `reverseCity` wrappers; pure `resolveLocationEdit`; service input extensions → Tasks 1, 2, 4. ✓
- Edge cases (not edited, offline, cleared field) → Task 1 tests + Task 8 QA. ✓
- No migration / no new deps. ✓

**Placeholder scan:** No TBD/TODO; every code step has full code. ✓

**Type consistency:** `LocationPatch` / `resolveLocationEdit` signature consistent across Tasks 1, 6, 7. `UpdateNoteInput` (Task 4) matches the `updateNote` call sites (Tasks 6). `geocodeLocation` returns `{lat,lng}|null`, `reverseCity` returns `string|null` — consumed consistently. `PendingNote.place_name` added in Task 4 used by `createNote`/`drainQueue`. ✓

> Open item for the implementer (verified during Task 4 Step 1): confirm `offlineQueue.ts`
> `PendingNote` shape and `drainQueue` row builder — the plan assumes `place_name` is added
> in both. If `drainQueue` is intentionally photo-less/location-full already, only add the
> field; don't change unrelated behavior.
